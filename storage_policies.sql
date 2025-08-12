-- Crear bucket 'invoices' en Storage y luego ejecutar esto:
-- READ para autenticados en el bucket invoices
drop policy if exists read_invoices on storage.objects;
drop policy if exists write_invoices on storage.objects;
drop policy if exists update_invoices on storage.objects;
drop policy if exists delete_invoices on storage.objects;

create policy read_invoices on storage.objects
for select using ( bucket_id = 'invoices' );

create policy write_invoices on storage.objects
for insert with check ( bucket_id = 'invoices' );

create policy update_invoices on storage.objects
for update using ( bucket_id = 'invoices' );

create policy delete_invoices on storage.objects
for delete using ( bucket_id = 'invoices' );
