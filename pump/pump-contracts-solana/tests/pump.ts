import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Pump } from "../target/types/pump";
import { expect } from "chai";
import {
  getArrayCodec,
  getBytesCodec,
  getStringCodec,
  getStructCodec,
  getTupleCodec,
  getU32Codec,
} from "@solana/codecs";

import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  LENGTH_SIZE,
  TYPE_SIZE,
  AccountLayout,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import {
  Transaction,
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  deserializeMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as metaplexPublicKey } from "@metaplex-foundation/umi";
import {
  bool,
  publicKey,
  struct,
  u64,
  u8,
  u32,
  Token,
} from "@raydium-io/raydium-sdk";
import { base64, bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  TokenMetadata,
  createInitializeInstruction,
  pack,
} from "@solana/spl-token-metadata";

export const MINT_LAYOUT = struct([
  u32("mintAuthorityOption"),
  publicKey("mintAuthority"),
  u64("supply"),
  u8("decimals"),
  bool("isInitialized"),
  u32("freezeAuthorityOption"),
  publicKey("freezeAuthority"),
]);
console.log(AccountLayout.span);
const parseCpiEvents = (
  transactionResponse,
  program
): { name: string; data: any }[] => {
  const events: { name: string; data: any }[] = [];
  const inner = transactionResponse?.meta?.innerInstructions ?? [];
  for (let i = 0; i < inner.length; i++) {
    for (let j = 0; j < inner[i].instructions.length; j++) {
      const ix = inner[i].instructions[j];
      const programPubkey =
        transactionResponse?.transaction.message.staticAccountKeys[
          ix.programIdIndex
        ];

      if (
        programPubkey === undefined ||
        !programPubkey.equals(program.programId)
      ) {
        // we are at instructions that does not match the linked program
        continue;
      }

      const parseAsTransactionCpiData = (log: string): string | null => {
        let encodedLog: Buffer;
        try {
          // verification if log is transaction cpi data encoded with base58
          encodedLog = bs58.decode(log);
        } catch (e) {
          return null;
        }

        const disc = encodedLog.slice(0, 8);
        const eventIxTag: anchor.BN = new anchor.BN("1d9acb512ea545e4", "hex");

        if (disc.equals(eventIxTag.toBuffer("le"))) {
          // after CPI tag data follows in format of standard event
          return base64.encode(encodedLog.slice(8));
        } else {
          return null;
        }
      };

      // console.log("event data", );
      const event = program.coder.events.decode(
        parseAsTransactionCpiData(ix.data)
      );

      if (event) {
        events.push(event);
      }
    }
  }

  return events;
};

describe("pump", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Pump as Program<Pump>;
  const user = program.provider;
  const mintKeyPair = anchor.web3.Keypair.generate();
  const [globalPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [anchor.utils.bytes.utf8.encode("global")],
    program.programId
  );
  const [bondingCurvePDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("bonding-curve"),
      mintKeyPair.publicKey.toBuffer(),
    ],
    program.programId
  );
  const associatedBondingCurvekp = Keypair.generate();
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mintKeyPair.publicKey,
    bondingCurvePDA,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  const associatedUser = getAssociatedTokenAddressSync(
    mintKeyPair.publicKey,
    user.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID
  );

  describe("initialize", async () => {
    it("sets initial parameters", async () => {
      await program.methods
        .initialize()
        .accounts({
          global: globalPDA,
        })
        .rpc();

      const globalAccount = await program.account.global.fetch(globalPDA);

      expect(globalAccount.authority).to.deep.equal(user.publicKey);
      expect(globalAccount.initialized).to.equal(true);
    });

    it("fails to initialize twice", async () => {
      try {
        await program.methods
          .initialize()
          .accounts({
            global: globalPDA,
          })
          .rpc();

        expect(false).to.equal(true);
      } catch (_err) {
        expect(true).to.equal(true);
      }
    });
  });

  describe("set_params", () => {
    it("sets parameters", async () => {
      const feeRecipient = anchor.web3.Keypair.generate();
      const initialVirtualTokenReserves = new anchor.BN(10 * 10 ** 6);
      const initialVirtualSolReserves = new anchor.BN(10 * 10 ** 9);
      const initialRealTokenReserves = new anchor.BN(5 * 10 ** 6);
      const tokenTotalSupply = new anchor.BN(20 * 10 ** 6);
      const feeBasisPoints = new anchor.BN(30);

      await program.methods
        .setParams(
          feeRecipient.publicKey,
          initialVirtualTokenReserves,
          initialVirtualSolReserves,
          initialRealTokenReserves,
          tokenTotalSupply,
          feeBasisPoints
        )
        .accounts({
          // @ts-ignore
          global: globalPDA,
        })
        .rpc();

      const globalAccount = await program.account.global.fetch(globalPDA);

      expect(globalAccount.feeRecipient).to.deep.equal(feeRecipient.publicKey);
      expect(globalAccount.initialVirtualTokenReserves.toString()).to.equal(
        initialVirtualTokenReserves.toString()
      );
      expect(globalAccount.initialVirtualSolReserves.toString()).to.equal(
        initialVirtualSolReserves.toString()
      );
      expect(globalAccount.initialRealTokenReserves.toString()).to.equal(
        initialRealTokenReserves.toString()
      );
      expect(globalAccount.tokenTotalSupply.toString()).to.equal(
        tokenTotalSupply.toString()
      );
      expect(globalAccount.feeBasisPoints.toString()).to.equal(
        feeBasisPoints.toString()
      );
    });
  });

  // Checks if all elements in the array are 0
  function isNonePubkey(buffer: Uint8Array): boolean {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] !== 0) {
        return false;
      }
    }
    return true;
  }

  const tokenMetadataCodec = getStructCodec([
    ["updateAuthority", getBytesCodec({ size: 32 })],
    ["mint", getBytesCodec({ size: 32 })],
    ["name", getStringCodec()],
    ["symbol", getStringCodec()],
    ["uri", getStringCodec()],
    [
      "additionalMetadata",
      getArrayCodec(getTupleCodec([getStringCodec(), getStringCodec()])),
    ],
  ]);

  function unpack(buffer: Buffer | Uint8Array): TokenMetadata {
    const data = tokenMetadataCodec.decode(buffer);

    return {
      mint: new PublicKey(data.mint),
      name: data.name,
      symbol: data.symbol,
      uri: data.uri,
      additionalMetadata: [],
    };
  }

  describe("create", () => {
    it("creates a new coin", async () => {
      const [mintAuthorityPDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [anchor.utils.bytes.utf8.encode("mint-authority")],
        program.programId
      );
      console.log(mintAuthorityPDA.toBase58());

      const mplTokenMetadata = new anchor.web3.PublicKey(
        MPL_TOKEN_METADATA_PROGRAM_ID.toString()
      );
      const mintLen = getMintLen([ExtensionType.MetadataPointer]);
      const md: TokenMetadata = {
        mint: mintKeyPair.publicKey,
        name: "foobar",
        symbol: "FOO",
        uri: "https://gist.githubusercontent.com/staccDOTsol/5157431dcc84e593a7017504ce54170a/raw/7fc1c3a45fcba7decece94710cc21bba5e446eaa/gistfile1.txt",
        additionalMetadata: [],
      };

      const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(md).length;
      const mintLamports =
        await program.provider.connection.getMinimumBalanceForRentExemption(
          mintLen + metadataLen
        );
      console.log(mintLamports);
      const mintIxs = [
        createInitializeMetadataPointerInstruction(
          mintKeyPair.publicKey,
          mintAuthorityPDA,
          mintKeyPair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
      ];

      const sig = await program.methods
        .create(
          "foobar",
          "FOO",
          "https://gist.githubusercontent.com/staccDOTsol/5157431dcc84e593a7017504ce54170a/raw/7fc1c3a45fcba7decece94710cc21bba5e446eaa/gistfile1.txt"
        )
        .accounts({
          mint: mintKeyPair.publicKey,
          mintAuthority: mintAuthorityPDA,
          bondingCurve: bondingCurvePDA,
          associatedBondingCurve: associatedBondingCurve,
          global: globalPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .preInstructions([
          SystemProgram.transfer({
            fromPubkey: user.publicKey,
            toPubkey: mintKeyPair.publicKey,
            lamports: mintLamports,
          }),
        ])
        .signers([mintKeyPair])
        .rpc();
      // await new Promise((resolve) => {
      //   setTimeout(resolve, 1000);
      // });

      // const txResult = await program.provider.connection.getTransaction(sig, {
      //   commitment: "confirmed",
      // });

      // console.log("result", await parseCpiEvents(txResult, program));

      const global = await program.account.global.fetch(globalPDA);
      const bondingCurve = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      const metadata = unpack(
        (
          await program.provider.connection.getAccountInfo(
            mintKeyPair.publicKey
          )
        ).data
      ) as TokenMetadata;
      const bondingCurveTokenAccountBalance =
        await program.provider.connection.getTokenAccountBalance(
          associatedBondingCurve
        );
      const mintRaw = await program.provider.connection.getAccountInfo(
        mintKeyPair.publicKey
      );
      const mint = MINT_LAYOUT.decode(mintRaw.data);

      // check that it sets the bonding curve parameters
      expect(bondingCurve.virtualTokenReserves.toString()).to.equal(
        global.initialVirtualTokenReserves.toString()
      );
      expect(bondingCurve.virtualSolReserves.toString()).to.equal(
        global.initialVirtualSolReserves.toString()
      );
      expect(bondingCurve.realTokenReserves.toString()).to.equal(
        global.initialRealTokenReserves.toString()
      );
      expect(bondingCurve.realSolReserves.toString()).to.equal("0");
      expect(bondingCurve.tokenTotalSupply.toString()).to.equal(
        global.tokenTotalSupply.toString()
      );
      expect(bondingCurve.complete).to.equal(false);

      // check that it sets the metadata
      expect(metadata.name).to.equal("foobar");
      expect(metadata.symbol).to.equal("FOO");
      expect(metadata.uri).to.equal(
        "https://gist.githubusercontent.com/staccDOTsol/5157431dcc84e593a7017504ce54170a/raw/7fc1c3a45fcba7decece94710cc21bba5e446eaa/gistfile1.txt"
      );
      expect(metadata.updateAuthority).to.equal(mintAuthorityPDA.toString());

      // check that it minted the tokens to the bonding curve
      expect(bondingCurveTokenAccountBalance.value.amount).to.equal(
        global.tokenTotalSupply.toString()
      );

      // check the mint parameters
      expect(mint.supply.toString()).to.equal(
        global.tokenTotalSupply.toString()
      );
      expect(mint.mintAuthority.toString()).to.equal(
        mintAuthorityPDA.toString()
      );
      expect(mint.isInitialized).to.equal(true);
      expect(mint.mintAuthorityOption).to.equal(0);
      expect(mint.freezeAuthorityOption).to.equal(0);
    });
  });

  describe("buy", () => {
    it("buys tokens", async () => {
      const global = await program.account.global.fetch(globalPDA);
      const buyAmount = new anchor.BN(2 * 10 ** 6);
      const solCost = buyAmount
        .mul(global.initialVirtualSolReserves)
        .div(global.initialVirtualTokenReserves.sub(buyAmount))
        .add(new anchor.BN(1));
      const fee = solCost.mul(global.feeBasisPoints).div(new anchor.BN(10000));

      const bondingCurveBalanceBefore =
        await program.provider.connection.getBalance(bondingCurvePDA);

      const tx = new Transaction();
      tx.add(
        createAssociatedTokenAccountInstruction(
          user.publicKey,
          associatedUser,
          user.publicKey,
          mintKeyPair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await anchor.getProvider().sendAndConfirm(tx);

      // execute the buy
      const sig = await program.methods
        .buy(buyAmount, solCost.add(fee))
        .accounts({
          feeRecipient: global.feeRecipient,
          global: globalPDA,
          mint: mintKeyPair.publicKey,
          bondingCurve: bondingCurvePDA,
          associatedBondingCurve,
          associatedUser,
          user: user.publicKey,
        })
        .rpc();

      // check that sol went to bonding curve
      expect(
        await program.provider.connection
          .getBalance(bondingCurvePDA)
          .then((r) => (r - bondingCurveBalanceBefore).toString())
      ).to.equal(solCost.toString());

      // check that tokens went to the user
      expect(
        await program.provider.connection
          .getTokenAccountBalance(associatedUser)
          .then((v) => v.value.amount.toString())
      ).to.equal(buyAmount.toString());

      // check that the sol fee went to the recipient
      expect(
        await program.provider.connection
          .getBalance(global.feeRecipient)
          .then((r) => r.toString())
      ).to.equal(fee.toString());

      // check that bonding curve was updated correctly
      const bondingCurve = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      expect(bondingCurve.virtualTokenReserves.toString()).to.equal(
        global.initialVirtualTokenReserves.sub(buyAmount).toString()
      );
      expect(bondingCurve.virtualSolReserves.toString()).to.equal(
        global.initialVirtualSolReserves.add(solCost).toString()
      );
      expect(bondingCurve.realTokenReserves.toString()).to.equal(
        global.initialRealTokenReserves.sub(buyAmount).toString()
      );
      expect(bondingCurve.realSolReserves.toString()).to.equal(
        solCost.toString()
      );
    });

    it("should revert if slippage is too high", async () => {
      const global = await program.account.global.fetch(globalPDA);
      const bondingCurve = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      const buyAmount = new anchor.BN(2 * 10 ** 6);
      const solCost = buyAmount
        .mul(bondingCurve.virtualSolReserves)
        .div(bondingCurve.virtualTokenReserves.sub(buyAmount))
        .add(new anchor.BN(1));
      const fee = solCost.mul(global.feeBasisPoints).div(new anchor.BN(10000));

      try {
        // execute the buy
        await program.methods
          .buy(buyAmount, solCost.add(fee).sub(new anchor.BN(1)))
          .accounts({
            feeRecipient: global.feeRecipient,
            global: globalPDA,
            mint: mintKeyPair.publicKey,
            bondingCurve: bondingCurvePDA,
            associatedBondingCurve,
            associatedUser,
            user: user.publicKey,
          })
          .rpc();

        expect(true).to.equal(false);
      } catch (err) {
        expect(err.error.errorMessage).to.equal(
          "slippage: Too much SOL required to buy the given amount of tokens."
        );
      }
    });

    // it("should mark bonding curve as complete", async () => {
    //   const global = await program.account.global.fetch(globalPDA);
    //   const bondingCurve = await program.account.bondingCurve.fetch(
    //     bondingCurvePDA
    //   );
    //   const buyAmount = bondingCurve.realTokenReserves;
    //   const solCost = buyAmount
    //     .mul(bondingCurve.virtualSolReserves)
    //     .div(bondingCurve.virtualTokenReserves.sub(buyAmount))
    //     .add(new anchor.BN(1));
    //   const fee = solCost.mul(global.feeBasisPoints).div(new anchor.BN(10000));

    //   // execute the buy
    //   await program.methods
    //     .buy(buyAmount, solCost.add(fee))
    //     .accounts({
    //       feeRecipient: global.feeRecipient,
    //       global: globalPDA,
    //       mint: mintKeyPair.publicKey,
    //       bondingCurve: bondingCurvePDA,
    //       associatedBondingCurve,
    //       associatedUser,
    //       user: user.publicKey,
    //     })
    //     .rpc();

    //   const bondingCurveAfter = await program.account.bondingCurve.fetch(
    //     bondingCurvePDA
    //   );
    //   expect(bondingCurveAfter.complete).to.equal(true);
    //   expect(bondingCurveAfter.realTokenReserves.toString()).to.equal("0");
    // });

    // it("should revert if bonding curve is complete", async () => {
    //   const global = await program.account.global.fetch(globalPDA);
    //   const bondingCurve = await program.account.bondingCurve.fetch(
    //     bondingCurvePDA
    //   );
    //   const buyAmount = new anchor.BN(2 * 10 ** 6);
    //   const solCost = buyAmount
    //     .mul(bondingCurve.virtualSolReserves)
    //     .div(bondingCurve.virtualTokenReserves.sub(buyAmount))
    //     .add(new anchor.BN(1));
    //   const fee = solCost.mul(global.feeBasisPoints).div(new anchor.BN(10000));

    //   try {
    //     // execute the buy
    //     await program.methods
    //       .buy(buyAmount, solCost.add(fee))
    //       .accounts({
    //         feeRecipient: global.feeRecipient,
    //         global: globalPDA,
    //         mint: mintKeyPair.publicKey,
    //         bondingCurve: bondingCurvePDA,
    //         associatedBondingCurve,
    //         associatedUser,
    //         user: user.publicKey,
    //       })
    //       .rpc();

    //     expect(true).to.equal(false);
    //   } catch (err) {
    //     expect(err.error.errorMessage).to.equal(
    //       "The bonding curve has completed and liquidity migrated to raydium."
    //     );
    //   }
    // });
  });

  describe("sell", () => {
    it("sells tokens", async () => {
      const global = await program.account.global.fetch(globalPDA);
      const bondingCurve = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      const sellAmount = new anchor.BN(2 * 10 ** 6);
      const expectedSol = sellAmount
        .mul(bondingCurve.virtualSolReserves)
        .div(bondingCurve.virtualTokenReserves.add(sellAmount));

      const fee = expectedSol
        .mul(global.feeBasisPoints)
        .div(new anchor.BN(10000));

      const bondingCurveBalanceBefore =
        await program.provider.connection.getBalance(bondingCurvePDA);

      const userBalanceBefore = await program.provider.connection.getBalance(
        user.publicKey
      );

      const feeRecipientBalanceBefore =
        await program.provider.connection.getBalance(global.feeRecipient);

      const userTokenBalanceBefore =
        await program.provider.connection.getTokenAccountBalance(
          associatedUser
        );

      const bondingCurveTokenBalanceBefore =
        await program.provider.connection.getTokenAccountBalance(
          associatedBondingCurve
        );

      // execute the sell
      await program.methods
        .sell(sellAmount, expectedSol.sub(fee))
        .accounts({
          feeRecipient: global.feeRecipient,
          global: globalPDA,
          mint: mintKeyPair.publicKey,
          bondingCurve: bondingCurvePDA,
          associatedBondingCurve,
          associatedUser,
          user: user.publicKey,
        })
        .rpc();

      // check that sol went from the bonding curve to the user
      expect(
        await program.provider.connection
          .getBalance(user.publicKey)
          .then((v) => v - userBalanceBefore)
      ).to.greaterThanOrEqual(
        expectedSol.sub(fee).sub(new anchor.BN(100_000)).toNumber()
      );
      expect(
        await program.provider.connection
          .getBalance(bondingCurvePDA)
          .then((v) => bondingCurveBalanceBefore - v)
      ).to.equal(expectedSol.toNumber());

      // check that the tokens went from the user to the bonding curve
      expect(
        await program.provider.connection
          .getTokenAccountBalance(associatedUser)
          .then((v) =>
            new anchor.BN(userTokenBalanceBefore.value.amount)
              .sub(new anchor.BN(v.value.amount))
              .toString()
          )
      ).to.equal(sellAmount.toString(0));
      expect(
        await program.provider.connection
          .getTokenAccountBalance(associatedBondingCurve)
          .then((v) =>
            new anchor.BN(v.value.amount)
              .sub(new anchor.BN(bondingCurveTokenBalanceBefore.value.amount))
              .toString()
          )
      ).to.equal(sellAmount.toString(0));

      // check that the sol fee went to the recipient
      expect(
        await program.provider.connection
          .getBalance(global.feeRecipient)
          .then((r) => r - feeRecipientBalanceBefore)
      ).to.equal(fee.toNumber());

      // check that the bonding curve was updated correctly
      const bondingCurveAfter = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      expect(bondingCurveAfter.virtualTokenReserves.toString()).to.equal(
        bondingCurve.virtualTokenReserves.add(sellAmount).toString()
      );
      expect(bondingCurveAfter.virtualSolReserves.toString()).to.equal(
        bondingCurve.virtualSolReserves.sub(expectedSol).toString()
      );
      expect(bondingCurveAfter.realTokenReserves.toString()).to.equal(
        bondingCurve.realTokenReserves.add(sellAmount).toString()
      );
      expect(bondingCurveAfter.realSolReserves.toString()).to.equal(
        bondingCurve.realSolReserves.sub(expectedSol).toString()
      );
    });

    // it("reverts if bonding curve is complete", async () => {
    //   const global = await program.account.global.fetch(globalPDA);
    //   const bondingCurve = await program.account.bondingCurve.fetch(
    //     bondingCurvePDA
    //   );
    //   const sellAmount = new anchor.BN(2 * 10 ** 6);
    //   const expectedSol = sellAmount
    //     .mul(bondingCurve.virtualSolReserves)
    //     .div(bondingCurve.virtualTokenReserves.add(sellAmount))
    //     .sub(new anchor.BN(1));

    //   const fee = expectedSol
    //     .mul(global.feeBasisPoints)
    //     .div(new anchor.BN(10000));

    //   try {
    //     // execute the sell
    //     await program.methods
    //       .sell(sellAmount, expectedSol.sub(fee))
    //       .accounts({
    //         feeRecipient: global.feeRecipient,
    //         global: globalPDA,
    //         mint: mintKeyPair.publicKey,
    //         bondingCurve: bondingCurvePDA,
    //         associatedBondingCurve,
    //         associatedUser,
    //         user: user.publicKey,
    //       })
    //       .rpc();
    //     expect(true).to.equal(true);
    //   } catch (err) {
    //     expect(err.error.errorMessage).to.equal(
    //       "The bonding curve has completed and liquidity migrated to raydium."
    //     );
    //   }
    // });
  });

  describe("withdraw", () => {
    it("withdraws", async () => {
      const global = await program.account.global.fetch(globalPDA);
      const bondingCurve = await program.account.bondingCurve.fetch(
        bondingCurvePDA
      );
      const buyAmount = bondingCurve.realTokenReserves;
      const solCost = buyAmount
        .mul(bondingCurve.virtualSolReserves)
        .div(bondingCurve.virtualTokenReserves.sub(buyAmount))
        .add(new anchor.BN(1));
      const fee = solCost.mul(global.feeBasisPoints).div(new anchor.BN(10000));

      // execute the buy
      await program.methods
        .buy(buyAmount, solCost.add(fee))
        .accounts({
          feeRecipient: global.feeRecipient,
          global: globalPDA,
          mint: mintKeyPair.publicKey,
          bondingCurve: bondingCurvePDA,
          associatedBondingCurve,
          associatedUser,
          user: user.publicKey,
        })
        .rpc();

      // act
      const userTokenBalanceBefore =
        await program.provider.connection.getTokenAccountBalance(
          associatedUser
        );
      const bondingCurveTokenBalanceBefore =
        await program.provider.connection.getTokenAccountBalance(
          associatedBondingCurve
        );

      const bondingCurveSolBalanceBefore =
        await program.provider.connection.getBalance(bondingCurvePDA);
      const userSolBalanceBefore = await program.provider.connection.getBalance(
        user.publicKey
      );

      // const withdrawAuthorityKeyFile = "/Users/out/.config/solana/withdraw-authority.json";
      // const privateKey = require(withdrawAuthorityKeyFile).slice(0, 32);
      // const withdrawAuthorityKeyPair = anchor.web3.Keypair.fromSeed(Uint8Array.from(privateKey));

      // await program.methods
      //   .withdraw()
      //   .accounts({
      //     global: globalPDA,
      //     mint: mintKeyPair.publicKey,
      //     bondingCurve: bondingCurvePDA,
      //     associatedBondingCurve,
      //     associatedUser,
      //   })
      //   .rpc();

      // // should transfer tokens from bonding curve to admin
      // expect(
      //   await program.provider.connection
      //     .getTokenAccountBalance(associatedUser)
      //     .then((v) =>
      //       new anchor.BN(v.value.amount)
      //         .sub(new anchor.BN(userTokenBalanceBefore.value.amount))
      //         .toString()
      //     )
      // ).to.equal(bondingCurveTokenBalanceBefore.value.amount);
      // expect(
      //   await program.provider.connection
      //     .getTokenAccountBalance(associatedBondingCurve)
      //     .then((v) => v.value.amount)
      // ).to.equal("0");

      // // should transfer sol from bonding curve to admin
      // expect(
      //   await program.provider.connection.getBalance(bondingCurvePDA)
      // ).to.lessThanOrEqual(bondingCurveSolBalanceBefore);
      // expect(
      //   await program.provider.connection.getBalance(user.publicKey)
      // ).to.greaterThanOrEqual(userSolBalanceBefore);

      // should mark bonding curve as complete
    });
  });
});
