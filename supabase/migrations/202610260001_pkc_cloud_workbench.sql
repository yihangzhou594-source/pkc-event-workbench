-- PKC cloud workbench schema.
-- All application access is server-side through the Supabase service role.

create table if not exists public.pkc_records (
  key text primary key
    check (key ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  data jsonb not null
    check (octet_length(data::text) <= 8 * 1024 * 1024),
  revision bigint not null default 1
    check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.pkc_backups (
  id bigint generated always as identity primary key,
  key text not null references public.pkc_records(key) on delete cascade,
  data jsonb not null,
  revision bigint not null check (revision > 0),
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create index if not exists pkc_backups_key_created_idx
  on public.pkc_backups (key, created_at desc);

create table if not exists public.pkc_audit (
  id bigint generated always as identity primary key,
  action text not null,
  record_key text not null default '',
  detail text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists pkc_audit_created_idx
  on public.pkc_audit (created_at desc);

alter table public.pkc_records enable row level security;
alter table public.pkc_backups enable row level security;
alter table public.pkc_audit enable row level security;

revoke all on table public.pkc_records from anon, authenticated;
revoke all on table public.pkc_backups from anon, authenticated;
revoke all on table public.pkc_audit from anon, authenticated;

grant select, insert, update, delete on table public.pkc_records to service_role;
grant select, insert, update, delete on table public.pkc_backups to service_role;
grant select, insert, update, delete on table public.pkc_audit to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.pkc_write_record(
  p_key text,
  p_data jsonb,
  p_expected_revision bigint default null,
  p_actor text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.pkc_records%rowtype;
  v_revision bigint;
  v_updated_at timestamptz;
  v_actor text := left(coalesce(p_actor, ''), 200);
begin
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$' then
    raise exception using
      errcode = 'P0001',
      message = 'pkc_invalid_key';
  end if;

  if p_data is null then
    raise exception using
      errcode = 'P0001',
      message = 'pkc_invalid_data';
  end if;

  select * into v_current
  from public.pkc_records
  where key = p_key
  for update;

  if found then
    if p_expected_revision is not null
      and p_expected_revision <> v_current.revision then
      raise exception using
        errcode = 'P0001',
        message = 'pkc_revision_conflict';
    end if;

    insert into public.pkc_backups (key, data, revision, created_by)
    values (p_key, v_current.data, v_current.revision, v_actor);

    update public.pkc_records
      set data = p_data,
          revision = v_current.revision + 1,
          updated_at = now(),
          updated_by = v_actor
      where key = p_key
      returning revision, updated_at into v_revision, v_updated_at;
  else
    if p_expected_revision is not null and p_expected_revision <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'pkc_revision_conflict';
    end if;

    insert into public.pkc_records (key, data, revision, updated_by)
    values (p_key, p_data, 1, v_actor)
    returning revision, updated_at into v_revision, v_updated_at;
  end if;

  delete from public.pkc_backups
  where id in (
    select id
    from public.pkc_backups
    where key = p_key
    order by created_at desc, id desc
    offset 100
  );

  insert into public.pkc_audit (action, record_key, detail, actor)
  values ('write', p_key, 'revision ' || v_revision::text, v_actor);

  return jsonb_build_object(
    'key', p_key,
    'revision', v_revision,
    'updatedAt', v_updated_at
  );
end;
$$;

create or replace function public.pkc_restore_record(
  p_backup_id bigint,
  p_actor text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backup public.pkc_backups%rowtype;
begin
  select * into v_backup
  from public.pkc_backups
  where id = p_backup_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'pkc_backup_not_found';
  end if;

  return public.pkc_write_record(
    v_backup.key,
    v_backup.data,
    null,
    left(coalesce(p_actor, ''), 200)
  );
end;
$$;

revoke all on function public.pkc_write_record(text, jsonb, bigint, text)
  from public, anon, authenticated;
revoke all on function public.pkc_restore_record(bigint, text)
  from public, anon, authenticated;

grant execute on function public.pkc_write_record(text, jsonb, bigint, text)
  to service_role;
grant execute on function public.pkc_restore_record(bigint, text)
  to service_role;

insert into public.pkc_audit (action, detail)
values ('schema', '202610260001_pkc_cloud_workbench applied')
on conflict do nothing;

