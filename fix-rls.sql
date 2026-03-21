
-- applicationsテーブルのRLS: 未ログインでもINSERT可能にする
-- （体入申込はログイン不要）
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーがあれば削除してから作成
DROP POLICY IF EXISTS "app_insert_anon" ON applications;
DROP POLICY IF EXISTS "app_insert_own" ON applications;

-- 誰でもINSERT可能（ログイン不問）
CREATE POLICY "app_insert_all" ON applications
  FOR INSERT WITH CHECK (true);

-- 読み取りはservice_roleのみ（管理者・オーナー経由）
DROP POLICY IF EXISTS "app_select_owner" ON applications;
CREATE POLICY "app_select_owner" ON applications
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

-- storesはpublicに読み取り可能
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stores_public_read" ON stores;
CREATE POLICY "stores_public_read" ON stores
  FOR SELECT USING (status = 'active');
