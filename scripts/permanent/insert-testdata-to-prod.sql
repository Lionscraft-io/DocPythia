-- Import testdata.csv to Production Database
-- This script inserts 65 Conflux community messages for processing
-- Run this on your production RDS instance

-- Step 1: Create CSV stream configuration
INSERT INTO stream_configs (stream_id, adapter_type, config, enabled, created_at, updated_at)
VALUES (
  'csv-conflux-community',
  'csv',
  '{"source": "testdata.csv", "channel": "conflux-community"}'::jsonb,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (stream_id)
DO UPDATE SET
  adapter_type = EXCLUDED.adapter_type,
  config = EXCLUDED.config,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

-- Step 2: Insert all messages from testdata.csv
INSERT INTO unified_messages (stream_id, message_id, timestamp, author, content, channel, raw_data, processing_status, created_at)
VALUES
  ('csv-conflux-community', 'csv-1', '2025-10-28 20:50:00', 'Julian Ueding', 'Wii-Mii: is there anyone looking for dev?', 'conflux-community', '{"source": "testdata.csv", "line": 1}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-2', '2025-10-28 20:51:00', 'Bonez', 'Bonez: Yes', 'conflux-community', '{"source": "testdata.csv", "line": 2}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-3', '2025-10-28 20:52:00', 'Rica', 'Rica: Hello, is here anyone whom could help me run a node? I can''t seem to figure it out on my own. I have the hardware necessary to do it, and I have installed Ubuntu on a VM, I just don''t have the necessary skills to figure it out on my own.', 'conflux-community', '{"source": "testdata.csv", "line": 3}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-4', '2025-10-28 20:53:00', 'Unknown', 'Unknown: You look dodgy', 'conflux-community', '{"source": "testdata.csv", "line": 4}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-5', '2025-10-28 20:54:00', 'iriesam', 'iriesam: Open a support ticket and we will help you out', 'conflux-community', '{"source": "testdata.csv", "line": 5}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-6', '2025-10-28 20:55:00', 'intrepid', 'intrepid: Hey rica. Steps on the developer docs https://doc.confluxnetwork.org/docs/general/run-a-node/', 'conflux-community', '{"source": "testdata.csv", "line": 6}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-7', '2025-10-28 20:56:00', '?i??', '?i??: Also check pinned messages in this channel and also from developers', 'conflux-community', '{"source": "testdata.csv", "line": 7}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-8', '2025-10-28 20:57:00', 'hackschnitzel1071 ALGO', 'hackschnitzel1071 ALGO: Hi, do I get it right a pos single node needs >1000cfx (~170$) to get ~11% apr? The more stake the more rewards. With a pool rewards can be higher because of fees of the stakers?', 'conflux-community', '{"source": "testdata.csv", "line": 8}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-9', '2025-10-28 20:58:00', 'iriesam', 'iriesam: Yes that is correct. A minimum of 1k cfx to stake and the apr is around 11.3%. Each community pool varies slightly', 'conflux-community', '{"source": "testdata.csv", "line": 9}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-10', '2025-10-28 20:59:00', '?i??', '?i??: average APR is 11.3%, but with only 1000CFX it''s hard to get voting rights as the pos pool will be very tiny.', 'conflux-community', '{"source": "testdata.csv", "line": 10}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-11', '2025-10-28 21:00:00', 'Unknown', 'Unknown: So, real APR will vary', 'conflux-community', '{"source": "testdata.csv", "line": 11}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-12', '2025-10-28 21:01:00', 'Estebanquito', 'Estebanquito: is there some way to prune old blocks? I don''t want to waste 1+TB of NVME just to store blocks that aren''t needed if i can', 'conflux-community', '{"source": "testdata.csv", "line": 12}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-13', '2025-10-28 21:02:00', 'Unknown', 'Unknown: Why are you using a backslash to bypass the link protection', 'conflux-community', '{"source": "testdata.csv", "line": 13}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-14', '2025-10-28 21:03:00', 'Unknown', 'Unknown: the two responses are a scam', 'conflux-community', '{"source": "testdata.csv", "line": 14}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-15', '2025-10-28 21:04:00', 'Unknown', 'Unknown: Another one?', 'conflux-community', '{"source": "testdata.csv", "line": 15}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-16', '2025-10-28 21:05:00', 'Ghost', 'Ghost: @0xn1c0', 'conflux-community', '{"source": "testdata.csv", "line": 16}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-17', '2025-10-28 21:06:00', '0xn1c0', '0xn1c0: maybe you should use a light node instead if you are concerned about storage: https://doc.confluxnetwork.org/docs/general/run-a-node/node-types', 'conflux-community', '{"source": "testdata.csv", "line": 17}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-18', '2025-10-28 21:07:00', 'Estebanquito', 'Estebanquito: Light nodes cannot be used in PoS afaik', 'conflux-community', '{"source": "testdata.csv", "line": 18}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-19', '2025-10-28 21:08:00', 'Unknown', 'Unknown: i want to run my PoS node but cannot waste 1+TB of nvme', 'conflux-community', '{"source": "testdata.csv", "line": 19}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-20', '2025-10-28 21:09:00', 'Unknown', 'Unknown: Most chains have a prune function that allows you to delete old blocks and reduce disk usage, old blocks are wasted space for me', 'conflux-community', '{"source": "testdata.csv", "line": 20}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-21', '2025-10-28 21:10:00', 'Unknown', 'Unknown: From the guide: A PoS node is also a Conflux node. So you can run a PoS node following the run a node guide. Either a full node or a archive node is fine.', 'conflux-community', '{"source": "testdata.csv", "line": 21}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-22', '2025-10-28 21:11:00', 'Unknown', 'Unknown: no mention of light node', 'conflux-community', '{"source": "testdata.csv", "line": 22}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-23', '2025-10-28 21:12:00', '?i??', '?i??: You can use btrfs + stdlib to have more space available', 'conflux-community', '{"source": "testdata.csv", "line": 23}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-24', '2025-10-28 21:13:00', '?i??', '?i??: Check pinned messages on developers', 'conflux-community', '{"source": "testdata.csv", "line": 24}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-25', '2025-10-28 21:14:00', '?i??', '?i??: developers?', 'conflux-community', '{"source": "testdata.csv", "line": 25}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-26', '2025-10-28 21:15:00', 'Estebanquito', 'Estebanquito: Will try, ty for the info!', 'conflux-community', '{"source": "testdata.csv", "line": 26}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-27', '2025-10-28 21:16:00', 'Estebanquito', 'Estebanquito: I hope some prune function is added anyways, as this works but doesn''t work as space will grow overtime and become literal wasted space', 'conflux-community', '{"source": "testdata.csv", "line": 27}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-28', '2025-10-28 21:17:00', 'Estebanquito', 'Estebanquito: still over a terabyte, will wait until something is done to get this down or just not run a node', 'conflux-community', '{"source": "testdata.csv", "line": 28}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-29', '2025-10-28 21:18:00', 'Ghost', 'Ghost: https://x.com/Conflux_Network/status/1900517777435185326', 'conflux-community', '{"source": "testdata.csv", "line": 29}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-30', '2025-10-28 21:19:00', 'mabi', 'mabi: Hello everyone, I am running a conflux node/server since last year all through linux/conflux-rust and would like to become a solo validator and stake all my CFX. I read the https://doc.confluxnetwork.org/docs/general/mine-stake/stake/become-a-solo-validator official documentation but this procedure is made for people using the fluent wallet which I am not. I am using my own conflux node to manage my wallets so I was wondering if there is a documentation available for people like me who would like to do everything through the conflux-rust CLI or using the RPC API via curl?', 'conflux-community', '{"source": "testdata.csv", "line": 30}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-31', '2025-10-28 21:20:00', 'GLM ARBA', 'GLM ARBA: For now I can confirm the ''STAKE IN POW'' step that references https://confluxhub.io/governance/pow-stake ...', 'conflux-community', '{"source": "testdata.csv", "line": 31}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-32', '2025-10-28 21:21:00', 'GLM ARBA', 'GLM ARBA: This should be the technical docs for the ''POS REGISTER'' step https://doc.confluxnetwork.org/docs/core/core-space-basics/internal-contracts/poSRegister', 'conflux-community', '{"source": "testdata.csv", "line": 32}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-33', '2025-10-28 21:22:00', '?i??', '?i??: @mabi I''m not 100% sure, but I remember reading something about software wallet that it was deprecated. Also havent used it myself. @0xn1c0 might know', 'conflux-community', '{"source": "testdata.csv", "line": 33}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-34', '2025-10-28 21:23:00', '?i??', '?i??: Otherwise you can use the RPC API with conflux sdk', 'conflux-community', '{"source": "testdata.csv", "line": 34}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-35', '2025-10-28 21:24:00', '?i??', '?i??: I''m not sure if there is direct documentation for RPC API available', 'conflux-community', '{"source": "testdata.csv", "line": 35}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-36', '2025-10-28 21:25:00', 'mabi', 'mabi: Hi @?i?? you mean the software wallet integrated into the conflux-rust node? My plan was anyway to use the RPC API simply using curl and passing it the right data but I miss the documentation for that...', 'conflux-community', '{"source": "testdata.csv", "line": 36}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-37', '2025-10-28 21:26:00', 'Mathilda', 'Mathilda: any cryptocurrency expert here I got an issue I need an assistance', 'conflux-community', '{"source": "testdata.csv", "line": 37}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-38', '2025-10-28 21:27:00', 'GLM ARBA', 'GLM ARBA: how can we help?', 'conflux-community', '{"source": "testdata.csv", "line": 38}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-39', '2025-10-28 21:28:00', 'SventuraOscura', 'SventuraOscura: Hello guys. i just downloaded conflux rust 2.50, extracted the snapshot, but my node doesn''t work at all.', 'conflux-community', '{"source": "testdata.csv", "line": 39}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-40', '2025-10-28 21:29:00', 'SventuraOscura', 'SventuraOscura: Also, is full of scammers even here.', 'conflux-community', '{"source": "testdata.csv", "line": 40}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-41', '2025-10-28 21:30:00', 'SventuraOscura', 'SventuraOscura: I Get this. each time i start the node. ...', 'conflux-community', '{"source": "testdata.csv", "line": 41}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-42', '2025-10-28 21:31:00', 'SventuraOscura', 'SventuraOscura: i just edited the line of the hydra file as type of node = full. Nothing else.', 'conflux-community', '{"source": "testdata.csv", "line": 42}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-43', '2025-10-28 21:32:00', '?i??', '?i??: /pos', 'conflux-community', '{"source": "testdata.csv", "line": 43}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-44', '2025-10-28 21:33:00', 'CFX-BotAPP', 'CFX-BotAPP: Conflux Proof-of-Stake - FAQ - Frequently Asked Questions ...', 'conflux-community', '{"source": "testdata.csv", "line": 44}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-45', '2025-10-28 21:34:00', '?i??', '?i??: what''s your system, os, hardware?', 'conflux-community', '{"source": "testdata.csv", "line": 45}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-46', '2025-10-28 21:35:00', 'SventuraOscura', 'SventuraOscura: solved the problem.', 'conflux-community', '{"source": "testdata.csv", "line": 46}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-47', '2025-10-28 21:36:00', '?i??', '?i??: what was the solution?', 'conflux-community', '{"source": "testdata.csv", "line": 47}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-48', '2025-10-28 21:37:00', 'xiaoxu1101', 'xiaoxu1101: what''s the benefit of being a node to help others stake coin?', 'conflux-community', '{"source": "testdata.csv", "line": 48}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-49', '2025-10-28 21:38:00', 'xiaoxu1101', 'xiaoxu1101: could you please answer the question I have asked?', 'conflux-community', '{"source": "testdata.csv", "line": 49}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-50', '2025-10-28 21:39:00', 'Tan Elliott', 'Tan Elliott: When running a node, you can earn staking rewards, support the network''s decentralized security, and potentially have voting rights in governance.', 'conflux-community', '{"source": "testdata.csv", "line": 50}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-51', '2025-10-28 21:40:00', 'GLM ARBA', 'GLM ARBA: A PoS pool can take a % of earned CFX, so it can be profitable', 'conflux-community', '{"source": "testdata.csv", "line": 51}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-52', '2025-10-28 21:41:00', 'GLM ARBA', 'GLM ARBA: A PoS node just allows you the owner to stake', 'conflux-community', '{"source": "testdata.csv", "line": 52}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-53', '2025-10-28 21:42:00', 'xiaoxu1101', 'xiaoxu1101: got it, which means that if there''s more nodes, that would be more decentralized right?', 'conflux-community', '{"source": "testdata.csv", "line": 53}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-54', '2025-10-28 21:43:00', 'GLM ARBA', 'GLM ARBA: absolutely. More nodes is a good thing', 'conflux-community', '{"source": "testdata.csv", "line": 54}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-55', '2025-10-28 21:44:00', 'tarzo', 'tarzo: Hello. According to GitHub, the hard fork is scheduled to activate on September 1st, but the page below states August 31st. Can you tell me which one?', 'conflux-community', '{"source": "testdata.csv", "line": 55}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-56', '2025-10-28 21:45:00', 'GLM ARBA', 'GLM ARBA: You are right to use the block calculator, it will be more accurate now than the estimate released a few weeks ago.', 'conflux-community', '{"source": "testdata.csv", "line": 56}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-57', '2025-10-28 21:46:00', '0xn1c0', '0xn1c0: Forwarded announcement: Conflux v3.0.1 Hardfork — upgrade required.', 'conflux-community', '{"source": "testdata.csv", "line": 57}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-58', '2025-10-28 21:47:00', 'xyz', 'xyz: Hi Conflux! We''re experiencing sync issues with our Conflux mainnet node. Despite using the fresh snapshot, the node remains stuck at epoch 130340000.', 'conflux-community', '{"source": "testdata.csv", "line": 58}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-59', '2025-10-28 21:48:00', 'Unknown', 'Unknown: why this chat seems full of scams', 'conflux-community', '{"source": "testdata.csv", "line": 59}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-60', '2025-10-28 21:49:00', 'Ghost', 'Ghost: Did you upgrade to latest software?', 'conflux-community', '{"source": "testdata.csv", "line": 60}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-61', '2025-10-28 21:50:00', 'xyz', 'xyz: yes confluxchain/conflux-rust:3.0.1-mainnet', 'conflux-community', '{"source": "testdata.csv", "line": 61}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-62', '2025-10-28 21:51:00', '?i??', '?i??: how long did you wait for it to be on that block? Sometimes the launch can be a bit slow', 'conflux-community', '{"source": "testdata.csv", "line": 62}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-63', '2025-10-28 21:52:00', 'xyz', 'xyz: around 24hours', 'conflux-community', '{"source": "testdata.csv", "line": 63}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-64', '2025-10-28 21:53:00', '?i??', '?i??: /pos', 'conflux-community', '{"source": "testdata.csv", "line": 64}'::jsonb, 'PENDING', NOW()),
  ('csv-conflux-community', 'csv-65', '2025-10-28 21:54:00', 'CFX-BotAPP', 'CFX-BotAPP: Conflux Proof-of-Stake FAQ again', 'conflux-community', '{"source": "testdata.csv", "line": 65}'::jsonb, 'PENDING', NOW())
ON CONFLICT (stream_id, message_id) DO NOTHING;

-- Verify the import
SELECT
  stream_id,
  COUNT(*) as message_count,
  MIN(timestamp) as earliest_message,
  MAX(timestamp) as latest_message,
  COUNT(CASE WHEN processing_status = 'PENDING' THEN 1 END) as pending_count
FROM unified_messages
WHERE stream_id = 'csv-conflux-community'
GROUP BY stream_id;
