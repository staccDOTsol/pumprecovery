# pumprecovery

Machine: staccs-MacBook-Pro.local
Date: 2026-06-24
User: staccoverflow

## What was copied (paths only, relative to recovery/)

### Keys (Solana private keys are included in this private repo)
- keys/discovered/staccs-MBP-20240624-7i.json
- keys/discovered/staccs-MBP-20240624-dummy2.json
- keys/discovered/staccs-MBP-20240624-id.json
- (originals also present in top-json/ and solana-config/)

### Top-level JSONs from ~
- top-json/7i.json
- top-json/dummy2.json
- top-json/mainnet.json
- top-json/package-lock.json
- top-json/package.json
- top-json/three_days.json
- top-json/today.json
- top-json/yesterday.json

### Solana config
- solana-config/id.json
- solana-config/cli/config.yml
- solana-config/install/config.yml

### Pump / related checkouts copied to pump/
- editfrontend
- kothanimate
- openai-pump-fun
- pump-amm
- pump-cache-server
- pump-contracts-solana
- pump-meta-dao-fe
- pump-real-amm
- pump-v2-amm
- pump-v2-client-server
- pump-v2-frontend
- pump-v2-metrics-server
- pump-v2-server
- pump-v2-supabase
- pumpagainfe
- pumpfut
- pumpitydooda
- pumpitydumpity
- rune-pump

## Notes
- Recovered from one machine as part of multi-machine private repo strategy.
- Copies used cp -a / rsync -a --update (with excludes for node_modules/target/.next/dist/build to keep recovery practical).
- Original files untouched.
- .gitignore protects against bloat for node_modules etc while keeping json + keys.
- Large data JSONs (mainnet.json etc) and pump source trees are present locally.
# pumprecovery
