// This will be our custom e2e ts testfile for sending transactions via gill / kid
// similiar to what anchor had in the past

// remember to run surfpool start before any testing will work.
import { loadKeypairSignerFromFile } from "gill/node";
import { TOKEN_PROGRAM_ADDRESS, getAssociatedTokenAccountAddress, getCreateAssociatedTokenIdempotentInstruction, ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from "gill/programs/token";
import { createSolanaClient, createTransaction, address, getAddressEncoder, getProgramDerivedAddress, generateKeyPairSigner } from "gill";
// import { getInitializePlatformInstruction } from "@/clients/js/src/generated";
import * as programClient from "../clients/js/src/generated";

const PROGRAM_ID = address('pVoTew8KNhq6rsrYq9jEUzKypytaLtQR62UbagWTCvu');

const authority = await loadKeypairSignerFromFile("~/.config/solana/id.json")

const enc = getAddressEncoder();

const { rpc, rpcSubscriptions, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker: "localnet",
});

const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
console.log("latestBlockhash", latestBlockhash)
// const initPlatIx = getInitializePlatformInstruction({ fee: [0,2], bump: 23, });

const [platformPda, platformBump] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [
    "config"
    // enc.encode(address('HzVT...')) 
  ]
});

const [vaultPda, vaultBump] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [
    enc.encode(platformPda)
  ]
});

// ############################# init the platform
const fee = Buffer.alloc(2);
fee.writeUInt16LE(500);
const initPlatIx = programClient.getInitializePlatformInstruction({
  authority: authority,
  platform: platformPda,
  vault: vaultPda,
  fee: fee,
  vaultBump: vaultBump,
  platformBump: platformBump
});
console.log("initPlatIx", initPlatIx)
const initializePlatformTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [
    initPlatIx
  ],
  latestBlockhash,
  computeUnitLimit: 5000,
  computeUnitPrice: 1000,
});

const initializePlatform = await sendAndConfirmTransaction(initializePlatformTransaction);
console.log("initializePlatform", initializePlatform)

// ################ Create a vote

const usdcMint = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const vote = await generateKeyPairSigner();
const [voteVaultPda, voteVaultBump] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [
    enc.encode(vote.address)
  ]
});
const timeToAdd = Buffer.alloc(8);
timeToAdd.writeBigInt64LE(86400n);

const initVoteIx = programClient.getInitializeVoteInstruction({
  authority,
  platform: platformPda,
  vault: vaultPda,
  vote: vote,
  token: usdcMint,
  voteVault: voteVaultPda,
  voteVaultTokenAccount: await getAssociatedTokenAccountAddress(usdcMint, voteVaultPda),
  associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  timeToAdd
});

console.log("initVoteIx", initVoteIx)

const initializeVoteTransaction = createTransaction({
  version: "legacy",
  feePayer: authority,
  instructions: [
    initVoteIx
  ],
  latestBlockhash,
  computeUnitLimit: 100_000,
  computeUnitPrice: 1000,
});


const initializeVote = await sendAndConfirmTransaction(initializeVoteTransaction);
console.log("initializeVote", initializeVote)

const { value: accountInfo } = await rpc.getAccountInfo(vote.address).send();
console.log("vote account info", accountInfo);
const voteAccount = await programClient.fetchVote(rpc, vote.address);
console.log("voteAccount", voteAccount);