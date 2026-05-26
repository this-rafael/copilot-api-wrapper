public class Fatorial {
    public static void main(String[] args) {
        int n = 5;
        System.out.println("Fatorial de " + n + " é: " + fatorial(n));
        
        // Testando com alguns valores
        for (int i = 0; i <= 10; i++) {
            System.out.println(i + "! = " + fatorial(i));
        }
    }

    /**
     * Calcula o fatorial de um número inteiro não negativo.
     * @param n O número para calcular o fatorial.
     * @return O fatorial de n.
     */
    public static long fatorial(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("O número deve ser não negativo.");
        }
        if (n == 0 || n == 1) {
            return 1;
        }
        long resultado = 1;
        for (int i = 2; i <= n; i++) {
            resultado *= i;
        }
        return resultado;
    }
}
