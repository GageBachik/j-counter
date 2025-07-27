#!/bin/bash
# test-jiminy.sh - LLM-friendly test runner

echo "Building Solana program..."
cargo build-sbf || exit 1

echo "Generating IDL..."
shank idl || exit 1

echo "Generating TypeScript client..."
npx codama run js || exit 1

echo "Starting surfpool..."
nohup surfpool start --no-tui > surfpool.log 2>&1 &
SURFPOOL_PID=$!

echo "Waiting for surfpool to initialize..."
sleep 3

echo "Running full e2e tests..."
npx tsx e2e/e2e.ts
TEST_RESULT=$?

echo "Stopping surfpool..."
kill -9 $SURFPOOL_PID

exit $TEST_RESULT