-- 004 · Backfill intrinsic dimensions for the 40 pre-existing gallery images
--
-- These 40 project_media rows predate the width/height columns (001). Measured
-- directly from the live files (decoded, not guessed) so the gallery renderer
-- can set explicit width/height per the spec's zero-CLS rule. Guarded on
-- `width is null` so it never overwrites a value the admin or pipeline sets later.

update public.project_media set width = 2160, height = 2700 where id = '255f27a5-af5d-43f5-8a8a-8e2281d17447' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'e196b06a-c41f-4be3-b0de-db937d5ab4de' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '919212aa-f110-4970-a270-f0870529a389' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '26cba742-9c98-41e2-8f4f-93497dd258ed' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '6b40f2a3-037e-401f-870c-2b49232188d3' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'ae63f145-e6fa-49b9-8ed3-761a0ae9c0fc' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '8bd8c428-2f9a-4c14-8ec9-874d3bf3474e' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '118e685d-e7fa-448e-ab91-0514f26b2a5f' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '6b6cb9ff-4498-4a10-bbd4-78fa6bee8bb7' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '764541c9-ce98-42e1-9c3c-dc707950f126' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'ea29213d-abc0-4f7e-9e42-ab204504023a' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '552a398d-b522-4450-a795-8f873796d8da' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '4cd49c18-18b1-446e-b676-5c053492285a' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'eeee27f8-ceb4-4e4e-b12c-b87c36d518d3' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'd82b285e-0a09-437b-a953-ad8d27c4029b' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'a6b56b41-58c2-42f5-9630-204c33c58f63' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '0cb907e1-5243-402e-80f9-5d22682386f8' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '536b992e-4519-40d6-9026-cab052bea4a9' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'f476d2f4-10da-4a8d-88d2-109f23172f7b' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '3a7eb053-3eb8-443d-b9ed-63afe56e0f7d' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '3e27c480-a6d0-4985-9206-bff2ca6a2ad1' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '8fe33f23-23fd-4121-9a74-55596bea1fee' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '94965897-06cc-4e0d-a626-345bf132e0d1' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '6f9e95bd-05e9-4be9-94bc-efa4b259e8b1' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'ca2dda17-6359-4220-96eb-9db291d62fc1' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '97986528-1044-4f20-abff-926973cb3373' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'ce748bb4-5ceb-491c-845d-375ca98a7b0e' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '71f029c7-a00b-47c2-8a02-f8761fb124aa' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'ec339663-8911-494f-891a-a14d40bd488b' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '87eef98b-3810-4d61-bd58-967ba406f6b2' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'dc850d0d-fe48-4a7f-bdf2-34f5e9a15f74' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'eabfa4c6-c1d1-41da-b451-3287cfe0548d' and width is null;
update public.project_media set width = 2160, height = 2700 where id = 'b68e4a67-863a-4049-b58c-e6960535ff01' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '0a8bdbb4-6eba-40a9-a9c6-65632e7ae15d' and width is null;
update public.project_media set width = 2048, height = 2560 where id = 'ae130d5f-0796-4535-ad73-8e685a2d5523' and width is null;
update public.project_media set width = 2048, height = 2560 where id = 'f0f6ef1f-691b-43a8-ba97-3f6fdc14eebe' and width is null;
update public.project_media set width = 2048, height = 2560 where id = '4a0910f3-f19a-4f07-827a-fa1063317193' and width is null;
update public.project_media set width = 1122, height = 1402 where id = '8ecdc5be-60e0-4ab6-a4f9-4da2d0a7364c' and width is null;
update public.project_media set width = 2048, height = 2560 where id = '94646ae3-9473-4003-89bf-67c0eb92919d' and width is null;
update public.project_media set width = 2160, height = 2700 where id = '88f74042-32dc-4cdf-be24-06d5fc2ef02b' and width is null;
