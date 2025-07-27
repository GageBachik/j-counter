// Simple test to verify basic functionality

import { loadKeypairSignerFromFile } from "gill/node";
import { createSolanaClient, createTransaction, address, getAddressEncoder, getProgramDerivedAddress } from "gill";
import * as programClient from "../clients/js/src/generated";

const PROGRAM_ID = address('Cntrt7BXEtNAnSo9ecGs9n9KkHGDF73Shr3xqFvsvQTJ');
const COUNTER_SEED = "counter";

const enc = getAddressEncoder();

const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker: "localnet",
});

// Load the authority keypair
const authority = await loadKeypairSignerFromFile("~/.config/solana/id.json");

console.log("Test authority:", authority.address);

// Helper function to convert count bytes to BigInt
function countToNumber(countBytes: Uint8Array): number {
  const view = new DataView(countBytes.buffer, countBytes.byteOffset, countBytes.byteLength);
  return Number(view.getBigUint64(0, true)); // little endian
}

console.log("\n=== Simple Test: Initialize and Increment Counter ===");
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

// Check if counter already exists
try {
  const existingCounter = await programClient.fetchCounter(rpc, counterPda);
  console.log("Counter already exists, current count:", countToNumber(existingCounter.data.count));
  
  // Just increment the existing counter
  const incrementIx = programClient.getIncrementInstruction({
    owner: authority,
    counter: counterPda,
  });

  const incrementTransaction = createTransaction({
    version: "legacy",
    feePayer: authority,
    instructions: [incrementIx],
    latestBlockhash,
    computeUnitLimit: 5000,
    computeUnitPrice: 1000,
  });

  const incrementSig = await sendAndConfirmTransaction(incrementTransaction);
  console.log("✅ Counter incremented successfully:", incrementSig);
  
  const updatedCounter = await programClient.fetchCounter(rpc, counterPda);
  const newCount = countToNumber(updatedCounter.data.count);
  console.log("New count:", newCount);
  
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
    
    // Fetch and verify the counter account
    const counterAccount = await programClient.fetchCounter(rpc, counterPda);
    console.log("Initial count:", countToNumber(counterAccount.data.count));
    
  } catch (error) {
    console.error("❌ Failed to initialize counter:", error);
    process.exit(1);
  }
}

console.log("\n✅ Simple test completed!");