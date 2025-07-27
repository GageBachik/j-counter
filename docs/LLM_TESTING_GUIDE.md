# LLM-Friendly Testing Guide for Jiminy App

This guide provides step-by-step instructions for testing the Jiminy voting application, specifically designed for LLM execution.

## Prerequisites

- Rust and Cargo installed
- Node.js and npm installed
- Solana CLI tools installed
- Project dependencies installed (`npm install`)

## Testing Steps

### 1. Build the Solana Program

```bash
cargo build-sbf
```

This compiles the Solana BPF program. You should see output indicating successful compilation.

### 2. Generate IDL

```bash
shank idl
```

This generates the Interface Definition Language (IDL) file at `idl/p_vote.json`. The IDL describes the program's interface for client libraries.

### 3. Generate TypeScript Client Files

```bash
npx codama run js
```

This uses Codama to generate TypeScript client files based on the IDL. These files are used by the e2e tests to interact with the on-chain program.

### 4. Start Surfpool Validator

```bash
nohup surfpool start --no-tui > surfpool.log 2>&1 &
```

**Important Notes:**

- The `--no-tui` flag is essential for LLM usage as terminal UIs cannot be interpreted
- Run this in the project root directory to ensure automatic program deployment
- The command runs in the background and logs to `surfpool.log`
- Wait 2-3 seconds for surfpool to fully initialize before proceeding

### 5. Run E2E Tests

```bash
npx tsx e2e/e2e.ts
```

This executes the end-to-end tests. Expected output includes:

- Transaction signatures for platform initialization
- Transaction signatures for vote initialization
- Vote account information showing the created voting structure

### 6. Stop Surfpool

```bash
pkill surfpool
```

This terminates the surfpool validator process cleanly.

## Automated Testing Script

For convenience, you can create an LLM-friendly testing script:

```bash
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

echo "Running e2e tests..."
npx tsx e2e/e2e.ts
TEST_RESULT=$?

echo "Stopping surfpool..."
kill -9 $SURFPOOL_PID

exit $TEST_RESULT
```

## Troubleshooting

### Surfpool doesn't auto-deploy

- Ensure you're running surfpool from the project root directory
- Check that `Surfpool.toml` exists and contains deployment configuration

### Tests fail with connection errors

- Verify surfpool is running: `ps aux | grep surfpool`
- Check surfpool logs: `tail -f surfpool.log`
- Ensure no other process is using port 8899

### Build or IDL generation fails

- Verify Rust toolchain: `rustup show`
- Check Solana CLI: `solana --version`
- Ensure all dependencies are installed: `npm install`

## Key Points for LLMs

1. **Sequential Execution**: Each step must complete successfully before proceeding to the next
2. **No TUI**: Always use `--no-tui` flag with surfpool for text-based output
3. **Background Processes**: Use `nohup` and `&` to run surfpool in background
4. **Clean Shutdown**: Always kill surfpool after tests to free resources
5. **Error Checking**: Monitor command outputs for errors before proceeding

This testing process validates that the Jiminy voting program compiles, deploys, and functions correctly through its TypeScript client interface.
