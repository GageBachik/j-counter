// Comprehensive e2e tests for Jiminy Counter program

import { loadKeypairSignerFromFile } from "gill/node";
import { createSolanaClient, createTransaction, address, getAddressEncoder, getProgramDerivedAddress, generateKeyPairSigner, ReadonlyUint8Array } from "gill";
import * as programClient from "../clients/js/src/generated";

const PROGRAM_ID = address('Cntrt7BXEtNAnSo9ecGs9n9KkHGDF73Shr3xqFvsvQTJ');
const COUNTER_SEED = "counter";

const enc = getAddressEncoder();

const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker: "localnet",
});

// Use default authority from filesystem (funded by surfpool) and generate unique user2
const authority = await loadKeypairSignerFromFile("~/.config/solana/id.json");
const user2 = await generateKeyPairSigner();

console.log("Test authority:", authority.address);
console.log("User2:", user2.address);

// Test 1: Initialize Counter
console.log("\n=== Test 1: Initialize Counter ===");
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

// Derive the counter PDA for authority
const [counterPda, counterBump] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [
    COUNTER_SEED,
    enc.encode(authority.address)
  ]
});

console.log("Counter PDA:", counterPda);
console.log("Counter bump:", counterBump);

// Check if counter already exists
let counterAccount;
try {
  counterAccount = await programClient.fetchCounter(rpc, counterPda);
  console.log("Counter already exists, skipping initialization");
  console.log("Existing count:", countToNumber(counterAccount.data.count));
} catch (fetchError) {
  console.log("Counter doesn't exist, initializing...");

  // Initialize counter instruction
  const initCounterIx = programClient.getInitializeCounterInstruction({
    owner: authority,
    counter: counterPda,
    systemProgram: address("11111111111111111111111111111111"),
  });

  const initCounterTransaction = createTransaction({
    version: "legacy",
    feePayer: authority,
    instructions: [initCounterIx],
    latestBlockhash,
    computeUnitLimit: 10000,
    computeUnitPrice: 1000,
  });

  try {
    const initCounterSig = await sendAndConfirmTransaction(initCounterTransaction);
    console.log("✅ Counter initialized successfully:", initCounterSig);

    // Fetch the newly created counter account
    counterAccount = await programClient.fetchCounter(rpc, counterPda);
  } catch (error) {
    console.error("❌ Failed to initialize counter:", error);
    process.exit(1);
  }
}
console.log("Counter state after initialization:", counterAccount);
console.log("Owner:", counterAccount.data.owner);
console.log("Count:", counterAccount.data.count);

// Helper function to convert count bytes to BigInt
function countToNumber(countBytes: ReadonlyUint8Array): number {
  const view = new DataView(countBytes.buffer, countBytes.byteOffset, countBytes.byteLength);
  return Number(view.getBigUint64(0, true)); // little endian
}

// Test 2: Increment Counter
console.log("\n=== Test 2: Increment Counter ===");
const incrementIx = programClient.getIncrementInstruction({
  owner: authority,
  counter: counterPda,
});

const incrementTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [incrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  const incrementSig = await sendAndConfirmTransaction(incrementTransaction);
  console.log("✅ Counter incremented successfully:", incrementSig);

  const updatedCounter = await programClient.fetchCounter(rpc, counterPda);
  const currentCount = countToNumber(updatedCounter.data.count);
  console.log("Count after increment:", currentCount);

  if (currentCount !== 1) {
    throw new Error(`Expected count to be 1, but got ${currentCount}`);
  }
} catch (error) {
  console.error("❌ Failed to increment counter:", error);
  process.exit(1);
}

// Test 3: Multiple Increments
console.log("\n=== Test 3: Multiple Increments ===");
for (let i = 0; i < 3; i++) {
  // Get fresh blockhash for each transaction
  await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay
  const freshBlockhash = await rpc.getLatestBlockhash().send();

  const incrementIx = programClient.getIncrementInstruction({
    owner: authority,
    counter: counterPda,
  });

  const incrementTransaction = createTransaction({
    version: "legacy",
    feePayer: authority,
    instructions: [incrementIx],
    latestBlockhash: freshBlockhash.value,
    computeUnitLimit: 5000,
    computeUnitPrice: 1000,
  });

  const incrementSig = await sendAndConfirmTransaction(incrementTransaction);
  console.log(`✅ Increment ${i + 1} successful:`, incrementSig);
}

const afterMultipleIncrements = await programClient.fetchCounter(rpc, counterPda);
const countAfterIncrements = countToNumber(afterMultipleIncrements.data.count);
console.log("Count after multiple increments:", countAfterIncrements);

if (countAfterIncrements !== 4) {
  throw new Error(`Expected count to be 4, but got ${countAfterIncrements}`);
}

// Test 4: Decrement Counter
console.log("\n=== Test 4: Decrement Counter ===");
const decrementIx = programClient.getDecrementInstruction({
  owner: authority,
  counter: counterPda,
});

// Add delay and get fresh blockhash
await new Promise(resolve => setTimeout(resolve, 500));
const decrementTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [decrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  const decrementSig = await sendAndConfirmTransaction(decrementTransaction);
  console.log("✅ Counter decremented successfully:", decrementSig);

  const afterDecrement = await programClient.fetchCounter(rpc, counterPda);
  const countAfterDecrement = countToNumber(afterDecrement.data.count);
  console.log("Count after decrement:", countAfterDecrement);

  if (countAfterDecrement !== 3) {
    throw new Error(`Expected count to be 3, but got ${countAfterDecrement}`);
  }
} catch (error) {
  console.error("❌ Failed to decrement counter:", error);
  process.exit(1);
}

// Test 5: User Isolation - Initialize counter for user2
console.log("\n=== Test 5: User Isolation - Initialize Counter for User2 ===");

// First, transfer some SOL to user2 from authority
console.log("Transferring SOL to user2...");

// Create system transfer instruction manually
const transferSolIx = {
  programAddress: address("11111111111111111111111111111111"), // System program
  accounts: [
    { address: authority.address, role: 0 /* writable signer */ },
    { address: user2.address, role: 1 /* writable */ },
  ],
  data: new Uint8Array([
    2, 0, 0, 0, // System transfer instruction discriminator
    ...new Uint8Array(new BigUint64Array([1000000000n]).buffer), // 1 SOL in lamports
  ]),
};

const transferTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [transferSolIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 100_000,
  computeUnitPrice: 1000,
});

const transferSig = await sendAndConfirmTransaction(transferTransaction);
console.log("✅ SOL transfer successful:", transferSig);

// Derive counter PDA for user2
const [user2CounterPda, user2CounterBump] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [
    COUNTER_SEED,
    enc.encode(user2.address)
  ]
});

console.log("User2 Counter PDA:", user2CounterPda);

// Initialize counter for user2
const initUser2CounterIx = programClient.getInitializeCounterInstruction({
  owner: user2,
  counter: user2CounterPda,
  systemProgram: address("11111111111111111111111111111111"),
});

// Add delay and get fresh blockhash
await new Promise(resolve => setTimeout(resolve, 500));
const initUser2CounterTransaction = createTransaction({
  version: "legacy",
  feePayer: user2,
  instructions: [initUser2CounterIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 100_000,
  computeUnitPrice: 1000,
});

try {
  const initUser2Sig = await sendAndConfirmTransaction(initUser2CounterTransaction);
  console.log("✅ User2 counter initialized successfully:", initUser2Sig);

  const user2Counter = await programClient.fetchCounter(rpc, user2CounterPda);
  console.log("User2 counter state:", user2Counter.data);
} catch (error) {
  console.error("❌ Failed to initialize user2 counter:", error);
  process.exit(1);
}

// Test 6: User Isolation - Authority cannot increment User2's counter
console.log("\n=== Test 6: User Isolation - Authority Cannot Increment User2's Counter ===");
const unauthorizedIncrementIx = programClient.getIncrementInstruction({
  owner: authority,
  counter: user2CounterPda, // Try to increment user2's counter with authority
});

const unauthorizedIncrementTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [unauthorizedIncrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  await sendAndConfirmTransaction(unauthorizedIncrementTransaction);
  console.error("❌ SECURITY ISSUE: Authority was able to increment user2's counter!");
  process.exit(1);
} catch (error) {
  console.log("✅ Correctly prevented authority from incrementing user2's counter");
  console.log("Error:", error.message || error);
}

// Test 7: User Isolation - User2 cannot increment Authority's counter
console.log("\n=== Test 7: User Isolation - User2 Cannot Increment Authority's Counter ===");
const unauthorizedUser2IncrementIx = programClient.getIncrementInstruction({
  owner: user2,
  counter: counterPda, // Try to increment authority's counter with user2
});

const unauthorizedUser2IncrementTransaction = createTransaction({
  version: "legacy",
  feePayer: user2,
  instructions: [unauthorizedUser2IncrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  await sendAndConfirmTransaction(unauthorizedUser2IncrementTransaction);
  console.error("❌ SECURITY ISSUE: User2 was able to increment authority's counter!");
  process.exit(1);
} catch (error) {
  console.log("✅ Correctly prevented user2 from incrementing authority's counter");
  console.log("Error:", error.message || error);
}

// Test 8: User2 can increment their own counter
console.log("\n=== Test 8: User2 Can Increment Their Own Counter ===");
const user2IncrementIx = programClient.getIncrementInstruction({
  owner: user2,
  counter: user2CounterPda,
});

const user2IncrementTransaction = createTransaction({
  version: "legacy",
  feePayer: user2,
  instructions: [user2IncrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  const user2IncrementSig = await sendAndConfirmTransaction(user2IncrementTransaction);
  console.log("✅ User2 incremented their counter successfully:", user2IncrementSig);

  const user2CounterAfter = await programClient.fetchCounter(rpc, user2CounterPda);
  const user2Count = countToNumber(user2CounterAfter.data.count);
  console.log("User2 count after increment:", user2Count);

  if (user2Count !== 1) {
    throw new Error(`Expected user2 count to be 1, but got ${user2Count}`);
  }
} catch (error) {
  console.error("❌ Failed to increment user2 counter:", error);
  process.exit(1);
}

// Test 9: Decrement underflow protection
console.log("\n=== Test 9: Decrement Underflow Protection ===");
// First, decrement user2's counter to 0
const user2DecrementIx = programClient.getDecrementInstruction({
  owner: user2,
  counter: user2CounterPda,
});

const user2DecrementTransaction = createTransaction({
  version: "legacy",
  feePayer: user2,
  instructions: [user2DecrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

await sendAndConfirmTransaction(user2DecrementTransaction);
console.log("✅ User2 counter decremented to 0");

// Now try to decrement below 0
const underflowDecrementTransaction = createTransaction({
  version: "legacy",
  feePayer: user2,
  instructions: [user2DecrementIx],
  latestBlockhash: (await rpc.getLatestBlockhash().send()).value,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

try {
  await sendAndConfirmTransaction(underflowDecrementTransaction);
  console.error("❌ ISSUE: Counter was able to underflow below 0!");
  process.exit(1);
} catch (error) {
  console.log("✅ Correctly prevented counter underflow");
  console.log("Error:", error.message || error);
}

// Final state check
console.log("\n=== Final State Check ===");
const finalAuthorityCounter = await programClient.fetchCounter(rpc, counterPda);
const finalUser2Counter = await programClient.fetchCounter(rpc, user2CounterPda);

console.log("Authority counter final count:", countToNumber(finalAuthorityCounter.data.count));
console.log("User2 counter final count:", countToNumber(finalUser2Counter.data.count));

console.log("\n✅ All tests passed successfully!");
console.log("The Jiminy Counter program is working correctly with proper user isolation.");