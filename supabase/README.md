# Supabase schema

The workbench stores its event documents in `pkc_records`. Previous versions live in
`pkc_backups`, and write operations are recorded in `pkc_audit`.

Apply the migration in the Supabase Dashboard:

1. Open the project's **SQL Editor**.
2. Paste the complete contents of
   `supabase/migrations/202610260001_pkc_cloud_workbench.sql`.
3. Run the SQL once.
4. Confirm that `pkc_records`, `pkc_backups`, and `pkc_audit` exist under
   **Table Editor**.
5. Confirm that `pkc_write_record` and `pkc_restore_record` exist under
   **Database > Functions**.

The migration revokes browser-role access. Only the Render service, using the
Supabase Service Role Key, may read or write these tables.
