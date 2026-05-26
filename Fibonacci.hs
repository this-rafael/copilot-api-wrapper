-- Fibonacci implementation in Haskell

-- 1. Simple recursive (exponential complexity)
fibRecursive :: Integer -> Integer
fibRecursive 0 = 0
fibRecursive 1 = 1
fibRecursive n = fibRecursive (n - 1) + fibRecursive (n - 2)

-- 2. Tail recursive (linear complexity)
fibTail :: Integer -> Integer
fibTail n = it 0 1 n
  where
    it a b 0 = a
    it a b n = it b (a + b) (n - 1)

-- 3. Infinite list (most idiomatic Haskell)
fibs :: [Integer]
fibs = 0 : 1 : zipWith (+) fibs (tail fibs)

fibList :: Int -> Integer
fibList n = fibs !! n

-- Example usage
main :: IO ()
main = do
    putStrLn "First 10 Fibonacci numbers:"
    print $ take 10 fibs
    putStrLn $ "The 10th Fibonacci number is: " ++ show (fibList 10)
