#!/usr/bin/env node

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const STATE_DIR = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
  'open-port',
);
const SKIP_WINDOWS = process.env.OPEN_PORT_SKIP_WINDOWS === '1';

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function usage(exitCode = 1) {
  const text =
    'Uso:\n' +
    '  open-port <porta-local> <porta-publica>\n' +
    '  open-port stop <porta-publica>\n\n' +
    'Exemplos:\n' +
    '  open-port 3000 3001\n' +
    '  open-port stop 3001\n';

  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(text);
  process.exit(exitCode);
}

function parsePort(value, label) {
  if (!/^[0-9]+$/.test(value)) {
    fail(`Erro: ${label} deve ser um numero entre 1 e 65535.`);
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`Erro: ${label} deve ser um numero entre 1 e 65535.`);
  }

  return port;
}

function pidPath(publicPort) {
  return path.join(STATE_DIR, `${publicPort}.pid`);
}

function logPath(publicPort) {
  return path.join(STATE_DIR, `${publicPort}.log`);
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && (error.code === 'ESRCH' || error.code === 'EPERM')) {
      return error.code === 'EPERM';
    }
    return false;
  }
}

function readTail(filePath, maxBytes = 4096) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  const stat = fs.statSync(filePath);
  const start = Math.max(stat.size - maxBytes, 0);
  const fd = fs.openSync(filePath, 'r');
  try {
    const length = stat.size - start;
    const buffer = Buffer.alloc(Math.max(length, 0));
    if (buffer.length > 0) {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    }
    return buffer.toString('utf8').trim();
  } finally {
    fs.closeSync(fd);
  }
}

function commandExists(command) {
  const result = spawnSync('which', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function getWslIp() {
  try {
    const result = spawnSync('hostname', ['-I'], { encoding: 'utf8' });
    if (result.status !== 0) {
      return null;
    }

    const candidates = (result.stdout || '').trim().split(/\s+/);
    for (const candidate of candidates) {
      if (candidate.includes('.') && !candidate.startsWith('127.')) {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getWindowsLanIp() {
  if (SKIP_WINDOWS || !commandExists('powershell.exe')) {
    return null;
  }

  const script =
    "$ip = Get-NetIPAddress -AddressFamily IPv4 | " +
    "Where-Object { " +
    "$_.IPAddress -notlike '169.254*' -and " +
    "$_.IPAddress -ne '127.0.0.1' -and " +
    "$_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback' " +
    "} | Select-Object -ExpandProperty IPAddress -First 1; " +
    "if ($ip) { $ip }";

  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
    });
    const value = (result.stdout || '').replace(/\r/g, '').trim();
    return value || null;
  } catch {
    return null;
  }
}

function manualWindowsCommands(publicPort, wslIp) {
  const ruleName = `WSL Open Port ${publicPort}`;
  return [
    `netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=${publicPort}`,
    `netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${publicPort} connectaddress=${wslIp} connectport=${publicPort}`,
    `netsh advfirewall firewall delete rule name="${ruleName}"`,
    `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${publicPort}`,
  ];
}

function runWindowsAdminScript(script) {
  if (SKIP_WINDOWS) {
    return [false, 'configuracao do Windows ignorada por OPEN_PORT_SKIP_WINDOWS=1.'];
  }

  if (!commandExists('powershell.exe')) {
    return [false, 'powershell.exe nao encontrado.'];
  }

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const launcher =
    "$ErrorActionPreference = 'Stop'; " +
    `$args = @('-NoProfile', '-EncodedCommand', '${encoded}'); ` +
    "$process = Start-Process PowerShell -Verb RunAs -Wait -PassThru -ArgumentList $args; " +
    'exit $process.ExitCode';

  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', launcher], {
      encoding: 'utf8',
    });

    if (result.status === 0) {
      return [true, ''];
    }

    const output = ((result.stderr || result.stdout || '') + '').replace(/\r/g, '').trim();
    return [false, output || 'nao foi possivel concluir a elevacao no Windows.'];
  } catch (error) {
    return [false, String(error)];
  }
}

function configureWindowsPort(publicPort, wslIp) {
  const ruleName = `WSL Open Port ${publicPort}`;
  const script = `
$ErrorActionPreference = 'Stop'
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=${publicPort} | Out-Null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${publicPort} connectaddress=${wslIp} connectport=${publicPort} | Out-Null
netsh advfirewall firewall delete rule name="${ruleName}" | Out-Null
netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${publicPort} | Out-Null
`;

  return runWindowsAdminScript(script);
}

function removeWindowsPort(publicPort) {
  const ruleName = `WSL Open Port ${publicPort}`;
  const script = `
$ErrorActionPreference = 'Stop'
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=${publicPort} | Out-Null
netsh advfirewall firewall delete rule name="${ruleName}" | Out-Null
`;

  return runWindowsAdminScript(script);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portIsOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;

    const finish = (value) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function serve(localPort, publicPort) {
  await new Promise((resolve, reject) => {
    const server = net.createServer((clientSocket) => {
      const upstream = net.createConnection({ host: '127.0.0.1', port: localPort });

      const onError = (error) => {
        console.error(`Erro ao conectar em 127.0.0.1:${localPort}: ${error.message}`);
        clientSocket.destroy();
        upstream.destroy();
      };

      upstream.on('error', onError);
      clientSocket.on('error', () => {
        upstream.destroy();
      });

      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });

    server.on('error', (error) => {
      reject(new Error(`Erro ao abrir 0.0.0.0:${publicPort}: ${error.message}`));
    });

    server.listen(publicPort, '0.0.0.0', () => {
      console.log(`Proxy ativo: 0.0.0.0:${publicPort} -> 127.0.0.1:${localPort}`);
      // Keep this promise unresolved while the server is alive.
      resolve(new Promise(() => {}));
    });
  });
}

async function stopProxy(publicPort) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pidFile = pidPath(publicPort);
  let pid = null;

  if (fs.existsSync(pidFile)) {
    const content = fs.readFileSync(pidFile, 'utf8').trim();
    if (/^[0-9]+$/.test(content)) {
      pid = Number.parseInt(content, 10);
    }
  }

  if (pid !== null && pidIsAlive(pid)) {
    process.kill(pid, 'SIGTERM');
    for (let index = 0; index < 20; index += 1) {
      if (!pidIsAlive(pid)) {
        break;
      }
      await sleep(100);
    }
    if (pidIsAlive(pid)) {
      process.kill(pid, 'SIGKILL');
    }
  }

  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }

  const [windowsOk, windowsMessage] = removeWindowsPort(publicPort);

  console.log(`Porta publica ${publicPort} encerrada no WSL.`);
  if (windowsOk) {
    console.log('Configuracao do Windows removida.');
  } else {
    console.log('Nao consegui remover a configuracao do Windows automaticamente.');
    if (windowsMessage) {
      console.log(`Detalhe: ${windowsMessage}`);
    }
    console.log('Rode no PowerShell como Administrador:');
    console.log(
      `  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=${publicPort}`,
    );
    console.log(`  netsh advfirewall firewall delete rule name="WSL Open Port ${publicPort}"`);
  }

  return 0;
}

async function startProxy(localPort, publicPort) {
  if (localPort === publicPort) {
    fail('Erro: a porta publica precisa ser diferente da porta local para evitar conflito de bind.');
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pidFile = pidPath(publicPort);
  let currentPid = null;

  if (fs.existsSync(pidFile)) {
    const content = fs.readFileSync(pidFile, 'utf8').trim();
    if (/^[0-9]+$/.test(content)) {
      currentPid = Number.parseInt(content, 10);
    }

    if (currentPid !== null && pidIsAlive(currentPid)) {
      fail(
        `Erro: a porta publica ${publicPort} ja esta aberta pelo PID ${currentPid}. ` +
          `Use \`open-port stop ${publicPort}\` antes de abrir de novo.`,
      );
    }

    fs.unlinkSync(pidFile);
  }

  const proxyLog = logPath(publicPort);
  let warning = null;
  if (!(await portIsOpen('127.0.0.1', localPort))) {
    warning =
      `Aviso: nada respondeu em 127.0.0.1:${localPort} durante a verificacao inicial. ` +
      'O proxy foi aberto mesmo assim.';
  }

  const outFd = fs.openSync(proxyLog, 'a');
  const child = spawn(process.execPath, [path.resolve(process.argv[1]), '--serve', String(localPort), String(publicPort)], {
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  child.unref();
  fs.closeSync(outFd);

  await sleep(400);
  if (!pidIsAlive(child.pid)) {
    const tail = readTail(proxyLog);
    fail(
      `Erro: nao consegui abrir a porta publica ${publicPort}.\n` +
        (tail || `Veja o log em ${proxyLog}.`),
    );
  }

  fs.writeFileSync(pidFile, `${child.pid}\n`, 'utf8');

  const wslIp = getWslIp();
  let windowsOk = false;
  let windowsMessage = '';

  if (wslIp) {
    [windowsOk, windowsMessage] = configureWindowsPort(publicPort, wslIp);
  } else {
    windowsMessage = 'nao foi possivel descobrir o IP do WSL.';
  }

  const windowsIp = getWindowsLanIp() || 'IP_DO_WINDOWS';

  console.log(`Proxy aberto: 127.0.0.1:${localPort} -> 0.0.0.0:${publicPort}`);
  console.log(`PID WSL: ${child.pid}`);
  console.log(`Log: ${proxyLog}`);
  if (warning) {
    console.log(warning);
  }

  if (wslIp) {
    console.log(`IP do WSL: ${wslIp}`);
  } else {
    console.log('IP do WSL: nao identificado');
  }

  if (windowsOk) {
    console.log('Windows: porta publicada com sucesso para a rede.');
    console.log(`Acesse de outra maquina em: http://${windowsIp}:${publicPort}`);
  } else {
    console.log('Windows: nao consegui publicar a porta automaticamente.');
    if (windowsMessage) {
      console.log(`Detalhe: ${windowsMessage}`);
    }
    if (wslIp) {
      console.log('Rode no PowerShell como Administrador:');
      for (const command of manualWindowsCommands(publicPort, wslIp)) {
        console.log(`  ${command}`);
      }
    }
    console.log(`Quando concluir no Windows, acesse: http://${windowsIp}:${publicPort}`);
  }

  console.log(`Para encerrar depois: open-port stop ${publicPort}`);
  return 0;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    usage(args[0] === '-h' || args[0] === '--help' ? 0 : 1);
  }

  if (args[0] === '--serve') {
    if (args.length !== 3) {
      usage(1);
    }

    const localPort = parsePort(args[1], 'porta-local');
    const publicPort = parsePort(args[2], 'porta-publica');
    await serve(localPort, publicPort);
    return 0;
  }

  if (args[0] === 'stop') {
    if (args.length !== 2) {
      usage(1);
    }
    return stopProxy(parsePort(args[1], 'porta-publica'));
  }

  if (args.length !== 2) {
    usage(1);
  }

  const localPort = parsePort(args[0], 'porta-local');
  const publicPort = parsePort(args[1], 'porta-publica');
  return startProxy(localPort, publicPort);
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    fail(String(error?.message || error));
  });