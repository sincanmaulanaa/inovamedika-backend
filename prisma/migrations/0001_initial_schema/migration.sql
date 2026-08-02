-- Inovamedika clinic information system - initial PostgreSQL 17 schema.
-- Timestamps represent instants (timestamptz); clinic operating days are explicit dates.

begin;

set local timezone = 'UTC';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function public.increment_row_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create function public.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = '55000';
end;
$$;

-- Identity and access -------------------------------------------------------

create table users (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  username text not null,
  email text,
  display_name text not null,
  password_hash text not null,
  role text not null,
  is_active boolean not null default true,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  password_changed_at timestamptz not null default now(),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_public_id_unique unique (public_id),
  constraint users_username_unique unique (username),
  constraint users_username_canonical check (
    username = lower(btrim(username))
    and username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
  ),
  constraint users_email_canonical check (
    email is null
    or (
      email = lower(btrim(email))
      and position('@' in email) > 1
    )
  ),
  constraint users_display_name_not_blank check (char_length(btrim(display_name)) > 0),
  constraint users_password_uses_argon2id check (password_hash like '$argon2id$%'),
  constraint users_role_valid check (
    role in ('ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR')
  ),
  constraint users_failed_login_attempts_nonnegative check (failed_login_attempts >= 0)
);

create unique index users_email_unique
  on users (email)
  where email is not null;

create index users_active_role_idx
  on users (role, id)
  where is_active;

create table permissions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  code text not null,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_public_id_unique unique (public_id),
  constraint permissions_code_unique unique (code),
  constraint permissions_code_canonical check (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  constraint permissions_description_not_blank check (char_length(btrim(description)) > 0)
);

create table user_permissions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (id) on delete cascade,
  permission_id bigint not null references permissions (id) on delete cascade,
  granted_by_user_id bigint references users (id) on delete set null,
  granted_at timestamptz not null default now(),
  constraint user_permissions_user_permission_unique unique (user_id, permission_id)
);

create index user_permissions_permission_id_idx on user_permissions (permission_id);
create index user_permissions_granted_by_user_id_idx on user_permissions (granted_by_user_id);

create table sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  user_id bigint not null references users (id) on delete cascade,
  token_family_id uuid not null default gen_random_uuid(),
  refresh_token_hash text not null,
  rotation_counter integer not null default 0,
  last_activity_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  last_rotated_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_public_id_unique unique (public_id),
  constraint sessions_id_user_id_unique unique (id, user_id),
  constraint sessions_refresh_token_hash_unique unique (refresh_token_hash),
  constraint sessions_refresh_token_hash_sha256 check (
    refresh_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint sessions_rotation_counter_nonnegative check (rotation_counter >= 0),
  constraint sessions_expiry_order check (
    last_activity_at <= idle_expires_at
    and idle_expires_at <= absolute_expires_at
  ),
  constraint sessions_revocation_reason_consistent check (
    (revoked_at is null and revoked_reason is null)
    or (
      revoked_at is not null
      and revoked_reason is not null
      and char_length(btrim(revoked_reason)) > 0
    )
  )
);

create unique index sessions_one_active_per_user_idx
  on sessions (user_id)
  where revoked_at is null;

create index sessions_user_id_idx on sessions (user_id);

create index sessions_absolute_expiry_idx
  on sessions (absolute_expires_at)
  where revoked_at is null;

-- Master data ---------------------------------------------------------------

create table doctors (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  user_id bigint not null references users (id) on delete restrict,
  full_name text not null,
  sip_number text not null,
  specialization text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctors_public_id_unique unique (public_id),
  constraint doctors_user_id_unique unique (user_id),
  constraint doctors_sip_number_unique unique (sip_number),
  constraint doctors_full_name_not_blank check (char_length(btrim(full_name)) > 0),
  constraint doctors_sip_number_not_blank check (char_length(btrim(sip_number)) > 0)
);

create function public.validate_doctor_user_role()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  selected_role text;
begin
  select app_user.role
    into selected_role
    from public.users app_user
    where app_user.id = new.user_id
    for update;

  if not found or selected_role <> 'DOCTOR' then
    raise exception 'a doctor profile must reference a user with the DOCTOR role'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.protect_doctor_user_role()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.role is distinct from old.role and exists (
    select 1 from public.doctors doctor where doctor.user_id = old.id
  ) then
    raise exception 'the role of a user with a doctor profile cannot be changed'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger doctors_10_validate_user_role
before insert or update of user_id on doctors
for each row execute function public.validate_doctor_user_role();

create trigger users_10_protect_doctor_role
before update of role on users
for each row execute function public.protect_doctor_user_role();

create table polyclinics (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  queue_prefix text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint polyclinics_public_id_unique unique (public_id),
  constraint polyclinics_code_unique unique (code),
  constraint polyclinics_queue_prefix_unique unique (queue_prefix),
  constraint polyclinics_code_canonical check (code ~ '^[A-Z0-9_]{2,32}$'),
  constraint polyclinics_name_not_blank check (char_length(btrim(name)) > 0),
  constraint polyclinics_queue_prefix_valid check (queue_prefix ~ '^[A-Z0-9]{1,8}$')
);

create table queue_lanes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  polyclinic_id bigint not null references polyclinics (id) on delete restrict,
  doctor_id bigint not null references doctors (id) on delete restrict,
  code text not null,
  display_name text not null,
  queue_prefix text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_lanes_public_id_unique unique (public_id),
  constraint queue_lanes_polyclinic_id_unique unique (polyclinic_id),
  constraint queue_lanes_code_unique unique (code),
  constraint queue_lanes_code_canonical check (code ~ '^[A-Z0-9_]{2,32}$'),
  constraint queue_lanes_display_name_not_blank check (char_length(btrim(display_name)) > 0),
  constraint queue_lanes_queue_prefix_valid check (queue_prefix ~ '^[A-Z0-9]{1,8}$')
);

create index queue_lanes_doctor_id_idx on queue_lanes (doctor_id);

create table payers (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  payer_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payers_public_id_unique unique (public_id),
  constraint payers_code_unique unique (code),
  constraint payers_code_canonical check (code ~ '^[A-Z0-9_]{2,32}$'),
  constraint payers_name_not_blank check (char_length(btrim(name)) > 0),
  constraint payers_type_valid check (
    payer_type in ('BPJS_KESEHATAN', 'COMPANY', 'PRIVATE_INSURANCE')
  )
);

create index payers_active_type_idx
  on payers (payer_type, name, id)
  where is_active;

create table medications (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  dosage_form text not null,
  strength text not null,
  kfa_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medications_public_id_unique unique (public_id),
  constraint medications_code_unique unique (code),
  constraint medications_code_canonical check (code ~ '^[A-Z0-9_-]{2,64}$'),
  constraint medications_name_not_blank check (char_length(btrim(name)) > 0),
  constraint medications_dosage_form_not_blank check (char_length(btrim(dosage_form)) > 0),
  constraint medications_strength_not_blank check (char_length(btrim(strength)) > 0),
  constraint medications_kfa_code_not_blank check (
    kfa_code is null or char_length(btrim(kfa_code)) > 0
  )
);

create unique index medications_kfa_code_unique
  on medications (kfa_code)
  where kfa_code is not null;

create index medications_active_name_idx
  on medications (name, id)
  where is_active;

-- Patients and registrations ------------------------------------------------

create sequence patient_medical_record_number_seq as bigint start with 1 cache 1;

create table patients (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  medical_record_number text not null,
  nik text not null,
  full_name text not null,
  sex text not null,
  date_of_birth date not null,
  phone text,
  normalized_phone text,
  address text,
  row_version integer not null default 1,
  deleted_at timestamptz,
  deleted_by_user_id bigint references users (id) on delete restrict,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_public_id_unique unique (public_id),
  constraint patients_medical_record_number_unique unique (medical_record_number),
  constraint patients_nik_unique unique (nik),
  constraint patients_medical_record_number_valid check (
    medical_record_number ~ '^RM-[0-9]{8,}$'
  ),
  constraint patients_nik_valid check (nik ~ '^[0-9]{16}$'),
  constraint patients_full_name_not_blank check (char_length(btrim(full_name)) > 0),
  constraint patients_sex_valid check (sex in ('MALE', 'FEMALE')),
  constraint patients_phone_not_blank check (phone is null or char_length(btrim(phone)) > 0),
  constraint patients_normalized_phone_valid check (
    normalized_phone is null or normalized_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint patients_row_version_positive check (row_version > 0),
  constraint patients_deletion_actor_consistent check (
    (deleted_at is null and deleted_by_user_id is null)
    or (deleted_at is not null and deleted_by_user_id is not null)
  )
);

create index patients_deleted_by_user_id_idx on patients (deleted_by_user_id);
create index patients_created_by_user_id_idx on patients (created_by_user_id);
create index patients_updated_by_user_id_idx on patients (updated_by_user_id);

create index patients_active_recent_idx
  on patients (created_at desc, id desc)
  where deleted_at is null;

create index patients_normalized_phone_idx
  on patients (normalized_phone)
  where normalized_phone is not null and deleted_at is null;

create function public.assign_and_protect_medical_record_number()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.medical_record_number is null or btrim(new.medical_record_number) = '' then
      new.medical_record_number :=
        'RM-' || lpad(nextval('public.patient_medical_record_number_seq'::regclass)::text, 8, '0');
    end if;
  elsif new.medical_record_number is distinct from old.medical_record_number then
    raise exception 'medical_record_number is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger patients_10_assign_and_protect_medical_record_number
before insert or update of medical_record_number on patients
for each row execute function public.assign_and_protect_medical_record_number();

create table registrations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  patient_id bigint not null references patients (id) on delete restrict,
  doctor_id bigint not null references doctors (id) on delete restrict,
  polyclinic_id bigint not null references polyclinics (id) on delete restrict,
  payer_id bigint references payers (id) on delete restrict,
  related_registration_id bigint references registrations (id) on delete restrict,
  service_date date not null,
  financing_type text not null,
  payer_member_number text,
  authorization_number text,
  visit_reason text not null,
  repeat_visit_reason text,
  status text not null default 'WAITING',
  checked_in_at timestamptz,
  exam_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  no_show_at timestamptz,
  no_show_reason text,
  row_version integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_public_id_unique unique (public_id),
  constraint registrations_id_patient_doctor_unique unique (id, patient_id, doctor_id),
  constraint registrations_financing_type_valid check (
    financing_type in ('SELF_PAY', 'BPJS_KESEHATAN', 'COMPANY', 'PRIVATE_INSURANCE')
  ),
  constraint registrations_payer_consistent check (
    (
      financing_type = 'SELF_PAY'
      and payer_id is null
      and payer_member_number is null
      and authorization_number is null
    )
    or (financing_type <> 'SELF_PAY' and payer_id is not null)
  ),
  constraint registrations_visit_reason_not_blank check (char_length(btrim(visit_reason)) > 0),
  constraint registrations_related_visit_consistent check (
    (related_registration_id is null and repeat_visit_reason is null)
    or (
      related_registration_id is not null
      and related_registration_id <> id
      and repeat_visit_reason is not null
      and char_length(btrim(repeat_visit_reason)) > 0
    )
  ),
  constraint registrations_status_valid check (
    status in ('WAITING', 'CHECKED_IN', 'IN_EXAM', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  constraint registrations_completed_consistent check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  ),
  constraint registrations_cancelled_consistent check (
    (
      status = 'CANCELLED'
      and cancelled_at is not null
      and cancelled_reason is not null
      and char_length(btrim(cancelled_reason)) > 0
    )
    or (
      status <> 'CANCELLED'
      and cancelled_at is null
      and cancelled_reason is null
    )
  ),
  constraint registrations_no_show_consistent check (
    (
      status = 'NO_SHOW'
      and no_show_at is not null
      and no_show_reason is not null
      and char_length(btrim(no_show_reason)) > 0
    )
    or (
      status <> 'NO_SHOW'
      and no_show_at is null
      and no_show_reason is null
    )
  ),
  constraint registrations_check_in_consistent check (
    status not in ('CHECKED_IN', 'IN_EXAM', 'COMPLETED') or checked_in_at is not null
  ),
  constraint registrations_exam_consistent check (
    status not in ('IN_EXAM', 'COMPLETED') or exam_started_at is not null
  ),
  constraint registrations_row_version_positive check (row_version > 0)
);

create unique index registrations_one_active_visit_idx
  on registrations (patient_id, service_date, polyclinic_id)
  where status in ('WAITING', 'CHECKED_IN', 'IN_EXAM');

create index registrations_patient_history_idx
  on registrations (patient_id, service_date desc, id desc);

create index registrations_service_dashboard_idx
  on registrations (service_date, status, id);

create index registrations_doctor_service_idx
  on registrations (doctor_id, service_date, status, id);

create index registrations_polyclinic_service_idx
  on registrations (polyclinic_id, service_date, status, id);

create index registrations_payer_id_idx on registrations (payer_id);
create index registrations_related_registration_id_idx on registrations (related_registration_id);
create index registrations_created_by_user_id_idx on registrations (created_by_user_id);
create index registrations_updated_by_user_id_idx on registrations (updated_by_user_id);

create function public.validate_registration_references()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  selected_payer_type text;
begin
  perform patient.id
    from public.patients patient
    where patient.id = new.patient_id
      and patient.deleted_at is null
    for update;

  if not found then
    raise exception 'registration requires an active patient'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.doctors d
    join public.users u on u.id = d.user_id
    join public.queue_lanes ql
      on ql.doctor_id = d.id
     and ql.polyclinic_id = new.polyclinic_id
     and ql.is_active
    join public.polyclinics p on p.id = ql.polyclinic_id
    where d.id = new.doctor_id
      and d.is_active
      and u.is_active
      and p.is_active
  ) then
    raise exception 'doctor is not active for the selected polyclinic'
      using errcode = '23514';
  end if;

  if new.payer_id is not null then
    select payer_type
      into selected_payer_type
      from public.payers
      where id = new.payer_id
        and is_active;

    if selected_payer_type is null or selected_payer_type <> new.financing_type then
      raise exception 'payer is inactive or does not match financing_type'
        using errcode = '23514';
    end if;
  end if;

  if new.related_registration_id is not null and not exists (
    select 1
    from public.registrations previous_registration
    where previous_registration.id = new.related_registration_id
      and previous_registration.patient_id = new.patient_id
      and previous_registration.status in ('COMPLETED', 'CANCELLED', 'NO_SHOW')
      and previous_registration.service_date <= new.service_date
  ) then
    raise exception 'related registration must be a completed visit for the same patient'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger registrations_10_validate_references
before insert or update of patient_id, doctor_id, polyclinic_id, payer_id, financing_type,
  related_registration_id, service_date
on registrations
for each row execute function public.validate_registration_references();

create function public.protect_patient_deletion()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'patients must be soft-deleted'
      using errcode = '55000';
  end if;

  if old.deleted_at is null and new.deleted_at is not null and exists (
    select 1 from public.registrations where patient_id = old.id
  ) then
    raise exception 'a patient with registrations cannot be deleted'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger patients_20_protect_hard_delete
before delete on patients
for each row execute function public.protect_patient_deletion();

create trigger patients_20_validate_soft_delete
before update of deleted_at on patients
for each row execute function public.protect_patient_deletion();

create table registration_status_history (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  registration_id bigint not null references registrations (id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  changed_by_user_id bigint not null references users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint registration_status_history_public_id_unique unique (public_id),
  constraint registration_status_history_from_status_valid check (
    from_status is null
    or from_status in ('WAITING', 'CHECKED_IN', 'IN_EXAM', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  constraint registration_status_history_to_status_valid check (
    to_status in ('WAITING', 'CHECKED_IN', 'IN_EXAM', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  constraint registration_status_history_transition_changes check (
    from_status is null or from_status <> to_status
  )
);

create index registration_status_history_registration_idx
  on registration_status_history (registration_id, changed_at, id);

create index registration_status_history_changed_by_user_id_idx
  on registration_status_history (changed_by_user_id);

-- Queue ---------------------------------------------------------------------

create table queue_counters (
  id bigint generated always as identity primary key,
  service_date date not null,
  queue_lane_id bigint not null references queue_lanes (id) on delete restrict,
  last_sequence_number bigint not null default 0,
  last_service_order bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queue_counters_lane_date_unique unique (service_date, queue_lane_id),
  constraint queue_counters_sequence_nonnegative check (last_sequence_number >= 0),
  constraint queue_counters_service_order_nonnegative check (last_service_order >= 0)
);

create index queue_counters_queue_lane_id_idx on queue_counters (queue_lane_id);

create table queues (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  registration_id bigint not null references registrations (id) on delete restrict,
  queue_lane_id bigint not null references queue_lanes (id) on delete restrict,
  service_date date not null,
  sequence_number bigint not null,
  service_order bigint not null,
  display_number text not null,
  status text not null default 'WAITING',
  call_count integer not null default 0,
  last_called_at timestamptz,
  skipped_at timestamptz,
  requeued_at timestamptz,
  serving_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  row_version integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint queues_public_id_unique unique (public_id),
  constraint queues_registration_id_unique unique (registration_id),
  constraint queues_display_number_unique unique (service_date, queue_lane_id, display_number),
  constraint queues_sequence_number_unique unique (
    service_date,
    queue_lane_id,
    sequence_number
  ),
  constraint queues_service_order_unique unique (service_date, queue_lane_id, service_order),
  constraint queues_sequence_positive check (sequence_number > 0),
  constraint queues_service_order_positive check (service_order > 0),
  constraint queues_display_number_valid check (
    display_number ~ '^[A-Z0-9]{1,8}-[0-9]{3,}$'
  ),
  constraint queues_status_valid check (
    status in ('WAITING', 'CALLED', 'SKIPPED', 'SERVING', 'COMPLETED', 'CANCELLED')
  ),
  constraint queues_call_count_nonnegative check (call_count >= 0),
  constraint queues_call_timestamp_consistent check (
    (call_count = 0 and last_called_at is null)
    or (call_count > 0 and last_called_at is not null)
  ),
  constraint queues_active_call_count_consistent check (
    status not in ('CALLED', 'SERVING', 'COMPLETED') or call_count > 0
  ),
  constraint queues_skipped_consistent check (
    (status <> 'SKIPPED' or (call_count >= 2 and skipped_at is not null))
    and (skipped_at is null or call_count >= 2)
  ),
  constraint queues_requeued_consistent check (
    requeued_at is null or skipped_at is not null
  ),
  constraint queues_returned_waiting_consistent check (
    status <> 'WAITING' or call_count = 0 or requeued_at is not null
  ),
  constraint queues_serving_timestamp_consistent check (
    status not in ('SERVING', 'COMPLETED') or serving_started_at is not null
  ),
  constraint queues_completed_timestamp_consistent check (
    (status = 'COMPLETED' and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  ),
  constraint queues_cancelled_consistent check (
    (
      status = 'CANCELLED'
      and cancelled_at is not null
      and cancellation_reason is not null
      and char_length(btrim(cancellation_reason)) > 0
    )
    or (
      status <> 'CANCELLED'
      and cancelled_at is null
      and cancellation_reason is null
    )
  ),
  constraint queues_row_version_positive check (row_version > 0)
);

create unique index queues_one_active_slot_per_lane_idx
  on queues (service_date, queue_lane_id)
  where status in ('CALLED', 'SERVING');

create index queues_waiting_call_next_idx
  on queues (queue_lane_id, service_date, service_order, id)
  where status = 'WAITING';

create index queues_lane_status_order_idx
  on queues (queue_lane_id, service_date, status, service_order, id);

create index queues_created_by_user_id_idx on queues (created_by_user_id);
create index queues_updated_by_user_id_idx on queues (updated_by_user_id);

create function public.validate_queue_registration()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  lane_queue_prefix text;
  expected_display_number text;
begin
  if tg_op = 'UPDATE' and (
    new.registration_id is distinct from old.registration_id
    or new.queue_lane_id is distinct from old.queue_lane_id
    or new.service_date is distinct from old.service_date
    or new.sequence_number is distinct from old.sequence_number
    or new.display_number is distinct from old.display_number
  ) then
    raise exception 'issued queue identity fields are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;

  select ql.queue_prefix
    into lane_queue_prefix
    from public.registrations r
    join public.queue_lanes ql
      on ql.id = new.queue_lane_id
     and ql.polyclinic_id = r.polyclinic_id
     and ql.doctor_id = r.doctor_id
     and ql.is_active
    where r.id = new.registration_id
      and r.status = 'CHECKED_IN'
      and r.service_date = new.service_date;

  if not found then
    raise exception 'queue requires a checked-in registration matching the lane and service date'
      using errcode = '23514';
  end if;

  expected_display_number := lane_queue_prefix || '-' || case
    when new.sequence_number < 1000 then lpad(new.sequence_number::text, 3, '0')
    else new.sequence_number::text
  end;

  if new.display_number <> expected_display_number then
    raise exception 'queue display number must match its lane prefix and sequence number'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger queues_10_validate_registration
before insert or update of registration_id, queue_lane_id, service_date, sequence_number,
  display_number
on queues
for each row execute function public.validate_queue_registration();

create table queue_call_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  queue_id bigint not null references queues (id) on delete restrict,
  call_number integer not null,
  called_by_user_id bigint not null references users (id) on delete restrict,
  called_at timestamptz not null default now(),
  constraint queue_call_events_public_id_unique unique (public_id),
  constraint queue_call_events_queue_call_number_unique unique (queue_id, call_number),
  constraint queue_call_events_call_number_positive check (call_number > 0)
);

create index queue_call_events_called_by_user_id_idx on queue_call_events (called_by_user_id);
create index queue_call_events_called_at_idx on queue_call_events (called_at desc, id desc);

create table queue_status_history (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  queue_id bigint not null references queues (id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  changed_by_user_id bigint not null references users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint queue_status_history_public_id_unique unique (public_id),
  constraint queue_status_history_from_status_valid check (
    from_status is null
    or from_status in ('WAITING', 'CALLED', 'SKIPPED', 'SERVING', 'COMPLETED', 'CANCELLED')
  ),
  constraint queue_status_history_to_status_valid check (
    to_status in ('WAITING', 'CALLED', 'SKIPPED', 'SERVING', 'COMPLETED', 'CANCELLED')
  ),
  constraint queue_status_history_transition_changes check (
    from_status is null or from_status <> to_status
  )
);

create index queue_status_history_queue_idx
  on queue_status_history (queue_id, changed_at, id);

create index queue_status_history_changed_by_user_id_idx
  on queue_status_history (changed_by_user_id);

-- Versioned clinical records ------------------------------------------------

create table medical_records (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  registration_id bigint not null,
  patient_id bigint not null references patients (id) on delete restrict,
  author_doctor_id bigint not null references doctors (id) on delete restrict,
  current_version_id bigint,
  lifecycle_status text not null default 'DRAFT',
  finalized_at timestamptz,
  row_version integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_records_public_id_unique unique (public_id),
  constraint medical_records_registration_id_unique unique (registration_id),
  constraint medical_records_registration_identity_fk
    foreign key (registration_id, patient_id, author_doctor_id)
    references registrations (id, patient_id, doctor_id)
    on delete restrict,
  constraint medical_records_lifecycle_status_valid check (
    lifecycle_status in ('DRAFT', 'FINAL')
  ),
  constraint medical_records_finalized_consistent check (
    (lifecycle_status = 'FINAL' and finalized_at is not null)
    or (lifecycle_status = 'DRAFT' and finalized_at is null)
  ),
  constraint medical_records_row_version_positive check (row_version > 0)
);

create index medical_records_patient_history_idx
  on medical_records (patient_id, created_at desc, id desc);

create index medical_records_author_doctor_id_idx on medical_records (author_doctor_id);
create index medical_records_created_by_user_id_idx on medical_records (created_by_user_id);
create index medical_records_updated_by_user_id_idx on medical_records (updated_by_user_id);

create table medical_record_versions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  medical_record_id bigint not null references medical_records (id) on delete restrict,
  version_number integer not null,
  version_kind text not null default 'INITIAL',
  status text not null default 'DRAFT',
  supersedes_version_id bigint references medical_record_versions (id) on delete restrict,
  author_doctor_id bigint not null references doctors (id) on delete restrict,
  subjective text,
  blood_pressure_systolic smallint,
  blood_pressure_diastolic smallint,
  temperature_celsius numeric(4, 1),
  weight_kg numeric(6, 2),
  height_cm numeric(5, 2),
  assessment text,
  plan text,
  correction_reason text,
  finalized_at timestamptz,
  finalized_by_user_id bigint references users (id) on delete restrict,
  approved_at timestamptz,
  approved_by_user_id bigint references users (id) on delete restrict,
  row_version integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_record_versions_public_id_unique unique (public_id),
  constraint medical_record_versions_number_unique unique (medical_record_id, version_number),
  constraint medical_record_versions_version_number_positive check (version_number > 0),
  constraint medical_record_versions_kind_valid check (
    version_kind in ('INITIAL', 'CORRECTION', 'ADDENDUM')
  ),
  constraint medical_record_versions_status_valid check (status in ('DRAFT', 'FINAL')),
  constraint medical_record_versions_lineage_consistent check (
    (
      version_kind = 'INITIAL'
      and version_number = 1
      and supersedes_version_id is null
      and correction_reason is null
    )
    or (
      version_kind in ('CORRECTION', 'ADDENDUM')
      and version_number > 1
      and supersedes_version_id is not null
      and supersedes_version_id <> id
      and correction_reason is not null
      and char_length(btrim(correction_reason)) > 0
    )
  ),
  constraint medical_record_versions_blood_pressure_consistent check (
    (
      blood_pressure_systolic is null
      and blood_pressure_diastolic is null
    )
    or (
      blood_pressure_systolic between 30 and 300
      and blood_pressure_diastolic between 20 and 200
      and blood_pressure_systolic > blood_pressure_diastolic
    )
  ),
  constraint medical_record_versions_temperature_reasonable check (
    temperature_celsius is null or temperature_celsius between 25 and 45
  ),
  constraint medical_record_versions_weight_reasonable check (
    weight_kg is null or weight_kg > 0 and weight_kg <= 500
  ),
  constraint medical_record_versions_height_reasonable check (
    height_cm is null or height_cm > 0 and height_cm <= 300
  ),
  constraint medical_record_versions_final_content_complete check (
    status = 'DRAFT'
    or (
      subjective is not null
      and char_length(btrim(subjective)) > 0
      and blood_pressure_systolic is not null
      and blood_pressure_diastolic is not null
      and temperature_celsius is not null
      and weight_kg is not null
      and height_cm is not null
      and assessment is not null
      and char_length(btrim(assessment)) > 0
      and plan is not null
      and char_length(btrim(plan)) > 0
      and finalized_at is not null
      and finalized_by_user_id is not null
    )
  ),
  constraint medical_record_versions_approval_consistent check (
    (approved_at is null and approved_by_user_id is null)
    or (approved_at is not null and approved_by_user_id is not null)
  ),
  constraint medical_record_versions_row_version_positive check (row_version > 0)
);

create unique index medical_record_versions_one_draft_idx
  on medical_record_versions (medical_record_id)
  where status = 'DRAFT';

create index medical_record_versions_supersedes_version_id_idx
  on medical_record_versions (supersedes_version_id);

create index medical_record_versions_author_doctor_id_idx
  on medical_record_versions (author_doctor_id);

create index medical_record_versions_finalized_by_user_id_idx
  on medical_record_versions (finalized_by_user_id);

create index medical_record_versions_approved_by_user_id_idx
  on medical_record_versions (approved_by_user_id);

create index medical_record_versions_created_by_user_id_idx
  on medical_record_versions (created_by_user_id);

create index medical_record_versions_updated_by_user_id_idx
  on medical_record_versions (updated_by_user_id);

alter table medical_records
  add constraint medical_records_current_version_id_fk
  foreign key (current_version_id)
  references medical_record_versions (id)
  on delete restrict
  deferrable initially immediate;

create index medical_records_current_version_id_idx on medical_records (current_version_id);

create table medical_actions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  medical_record_version_id bigint not null
    references medical_record_versions (id) on delete restrict,
  action_name text not null,
  notes text,
  sort_order integer not null default 1,
  performed_by_doctor_id bigint not null references doctors (id) on delete restrict,
  created_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_actions_public_id_unique unique (public_id),
  constraint medical_actions_action_name_not_blank check (char_length(btrim(action_name)) > 0),
  constraint medical_actions_sort_order_positive check (sort_order > 0),
  constraint medical_actions_version_sort_unique unique (medical_record_version_id, sort_order)
);

create index medical_actions_performed_by_doctor_id_idx
  on medical_actions (performed_by_doctor_id);

create index medical_actions_created_by_user_id_idx on medical_actions (created_by_user_id);

create table prescriptions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  medical_record_version_id bigint not null
    references medical_record_versions (id) on delete restrict,
  prescriber_doctor_id bigint not null references doctors (id) on delete restrict,
  prescriber_name_snapshot text,
  prescriber_sip_snapshot text,
  status text not null default 'DRAFT',
  prescribed_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by_user_id bigint references users (id) on delete restrict,
  notes text,
  row_version integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  updated_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescriptions_public_id_unique unique (public_id),
  constraint prescriptions_medical_record_version_id_unique unique (medical_record_version_id),
  constraint prescriptions_status_valid check (status in ('DRAFT', 'FINAL')),
  constraint prescriptions_finalized_consistent check (
    (
      status = 'DRAFT'
      and finalized_at is null
      and finalized_by_user_id is null
    )
    or (
      status = 'FINAL'
      and finalized_at is not null
      and finalized_by_user_id is not null
      and prescriber_name_snapshot is not null
      and char_length(btrim(prescriber_name_snapshot)) > 0
      and prescriber_sip_snapshot is not null
      and char_length(btrim(prescriber_sip_snapshot)) > 0
    )
  ),
  constraint prescriptions_row_version_positive check (row_version > 0)
);

create index prescriptions_prescriber_doctor_id_idx on prescriptions (prescriber_doctor_id);
create index prescriptions_finalized_by_user_id_idx on prescriptions (finalized_by_user_id);
create index prescriptions_created_by_user_id_idx on prescriptions (created_by_user_id);
create index prescriptions_updated_by_user_id_idx on prescriptions (updated_by_user_id);

create table prescription_items (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  prescription_id bigint not null references prescriptions (id) on delete restrict,
  medication_id bigint references medications (id) on delete restrict,
  is_unmapped boolean not null default false,
  medication_name_snapshot text,
  dosage_form_snapshot text,
  strength_snapshot text,
  quantity numeric(10, 2),
  quantity_unit text,
  dose_value numeric(10, 3),
  dose_unit text,
  frequency text,
  route text,
  duration_or_stop_condition text,
  patient_instructions text,
  notes text,
  not_applicable_reasons jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1,
  created_by_user_id bigint not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescription_items_public_id_unique unique (public_id),
  constraint prescription_items_prescription_sort_unique unique (prescription_id, sort_order),
  constraint prescription_items_medication_mapping_consistent check (
    medication_id is null or not is_unmapped
  ),
  constraint prescription_items_unmapped_consistent check (
    not is_unmapped or medication_id is null
  ),
  constraint prescription_items_quantity_positive check (quantity is null or quantity > 0),
  constraint prescription_items_dose_positive check (dose_value is null or dose_value > 0),
  constraint prescription_items_sort_order_positive check (sort_order > 0),
  constraint prescription_items_not_applicable_object check (
    jsonb_typeof(not_applicable_reasons) = 'object'
  )
);

create index prescription_items_medication_id_idx on prescription_items (medication_id);
create index prescription_items_created_by_user_id_idx on prescription_items (created_by_user_id);

create function public.validate_clinical_version_lineage()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.supersedes_version_id is not null and not exists (
    select 1
    from public.medical_record_versions previous_version
    where previous_version.id = new.supersedes_version_id
      and previous_version.medical_record_id = new.medical_record_id
      and previous_version.status = 'FINAL'
      and previous_version.version_number < new.version_number
  ) then
    raise exception 'superseded version must be an earlier final version of the same record'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.validate_medical_record_current_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  current_version_number integer;
  current_version_status text;
  previous_version_number integer;
begin
  if tg_op = 'UPDATE'
     and old.lifecycle_status = 'FINAL'
     and new.lifecycle_status <> 'FINAL' then
    raise exception 'a final medical record cannot return to draft'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and old.lifecycle_status = 'FINAL'
     and (
       new.registration_id is distinct from old.registration_id
       or new.patient_id is distinct from old.patient_id
       or new.author_doctor_id is distinct from old.author_doctor_id
     ) then
    raise exception 'registration, patient, and doctor are immutable on a final medical record'
      using errcode = '55000';
  end if;

  if new.current_version_id is not null then
    select version.status, version.version_number
      into current_version_status, current_version_number
      from public.medical_record_versions version
      where version.id = new.current_version_id
        and version.medical_record_id = new.id;

    if not found then
      raise exception 'current version must belong to the same medical record'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.current_version_id is not null
     and new.current_version_id is null then
    raise exception 'current medical record version cannot be cleared'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and old.current_version_id is not null
     and new.current_version_id is distinct from old.current_version_id then
    select version.version_number
      into previous_version_number
      from public.medical_record_versions version
      where version.id = old.current_version_id
        and version.medical_record_id = old.id;

    if current_version_number <= previous_version_number then
      raise exception 'current medical record version can only move forward'
        using errcode = '55000';
    end if;
  end if;

  if new.lifecycle_status = 'FINAL'
     and (new.current_version_id is null or current_version_status <> 'FINAL') then
    raise exception 'a final medical record must point to its own final version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.protect_final_medical_record_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status = 'FINAL' then
    raise exception 'a final medical record version cannot be updated or deleted'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and (
    new.medical_record_id is distinct from old.medical_record_id
    or new.version_number is distinct from old.version_number
    or new.version_kind is distinct from old.version_kind
    or new.supersedes_version_id is distinct from old.supersedes_version_id
    or new.author_doctor_id is distinct from old.author_doctor_id
  ) then
    raise exception 'medical record version ownership and lineage are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.protect_medical_version_child()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  new_parent_id bigint;
  old_parent_id bigint;
  parent_version record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_parent_id := old.medical_record_version_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_parent_id := new.medical_record_version_id;
  end if;

  for parent_version in
    select version.id, version.status
    from public.medical_record_versions version
    where version.id = old_parent_id or version.id = new_parent_id
    order by version.id
    for update
  loop
    if parent_version.status = 'FINAL' then
      raise exception 'children of a final medical record version are immutable'
        using errcode = '55000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.protect_prescription()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  new_parent_id bigint;
  old_parent_id bigint;
  parent_version record;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'FINAL' then
    raise exception 'a final prescription cannot be updated or deleted'
      using errcode = '55000';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_parent_id := old.medical_record_version_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_parent_id := new.medical_record_version_id;
  end if;

  for parent_version in
    select version.id, version.status
    from public.medical_record_versions version
    where version.id = old_parent_id or version.id = new_parent_id
    order by version.id
    for update
  loop
    if parent_version.status = 'FINAL' then
      raise exception 'a prescription attached to a final medical record version is immutable'
        using errcode = '55000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.protect_prescription_item()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  new_parent_id bigint;
  old_parent_id bigint;
  parent_prescription record;
  parent_version record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_parent_id := old.prescription_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_parent_id := new.prescription_id;
  end if;

  for parent_prescription in
    select prescription.id, prescription.status
    from public.prescriptions prescription
    where prescription.id = old_parent_id or prescription.id = new_parent_id
    order by prescription.id
    for update
  loop
    if parent_prescription.status = 'FINAL' then
      raise exception 'items of a final prescription are immutable'
        using errcode = '55000';
    end if;
  end loop;

  for parent_version in
    select version.id, version.status
    from public.medical_record_versions version
    where version.id in (
      select prescription.medical_record_version_id
      from public.prescriptions prescription
      where prescription.id = old_parent_id or prescription.id = new_parent_id
    )
    order by version.id
    for update
  loop
    if parent_version.status = 'FINAL' then
      raise exception 'items of a final medical record version are immutable'
        using errcode = '55000';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.validate_final_prescription()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'FINAL' and (tg_op = 'INSERT' or old.status <> 'FINAL') then
    if not exists (
      select 1 from public.prescription_items where prescription_id = new.id
    ) then
      raise exception 'a final prescription must have at least one item'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.prescription_items item
      where item.prescription_id = new.id
        and (
          item.medication_name_snapshot is null
          or char_length(btrim(item.medication_name_snapshot)) = 0
          or item.dosage_form_snapshot is null
          or char_length(btrim(item.dosage_form_snapshot)) = 0
          or item.strength_snapshot is null
          or char_length(btrim(item.strength_snapshot)) = 0
          or item.quantity is null
          or item.quantity_unit is null
          or char_length(btrim(item.quantity_unit)) = 0
          or item.patient_instructions is null
          or char_length(btrim(item.patient_instructions)) = 0
          or (
            (item.medication_id is null and not item.is_unmapped)
            or (item.medication_id is not null and item.is_unmapped)
          )
          or (
            item.dose_value is null
            and not (
              item.not_applicable_reasons ? 'dose'
              and coalesce(
                jsonb_typeof(item.not_applicable_reasons -> 'dose') = 'string',
                false
              )
              and coalesce(
                char_length(btrim(item.not_applicable_reasons ->> 'dose')) > 0,
                false
              )
            )
          )
          or (
            item.dose_value is not null
            and (item.dose_unit is null or char_length(btrim(item.dose_unit)) = 0)
          )
          or (
            item.frequency is null
            and not (
              item.not_applicable_reasons ? 'frequency'
              and coalesce(
                jsonb_typeof(item.not_applicable_reasons -> 'frequency') = 'string',
                false
              )
              and coalesce(
                char_length(btrim(item.not_applicable_reasons ->> 'frequency')) > 0,
                false
              )
            )
          )
          or (item.frequency is not null and char_length(btrim(item.frequency)) = 0)
          or (
            item.route is null
            and not (
              item.not_applicable_reasons ? 'route'
              and coalesce(
                jsonb_typeof(item.not_applicable_reasons -> 'route') = 'string',
                false
              )
              and coalesce(
                char_length(btrim(item.not_applicable_reasons ->> 'route')) > 0,
                false
              )
            )
          )
          or (item.route is not null and char_length(btrim(item.route)) = 0)
          or (
            item.duration_or_stop_condition is null
            and not (
              item.not_applicable_reasons ? 'duration'
              and coalesce(
                jsonb_typeof(item.not_applicable_reasons -> 'duration') = 'string',
                false
              )
              and coalesce(
                char_length(btrim(item.not_applicable_reasons ->> 'duration')) > 0,
                false
              )
            )
          )
          or (
            item.duration_or_stop_condition is not null
            and char_length(btrim(item.duration_or_stop_condition)) = 0
          )
        )
    ) then
      raise exception 'every final prescription item must contain the required structured fields'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create function public.validate_final_medical_record_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'FINAL' and (tg_op = 'INSERT' or old.status <> 'FINAL') and exists (
    select 1
    from public.prescriptions
    where medical_record_version_id = new.id
      and status <> 'FINAL'
  ) then
    raise exception 'a medical record version cannot be finalized with a draft prescription'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger medical_record_versions_10_protect_final
before update or delete on medical_record_versions
for each row execute function public.protect_final_medical_record_version();

create trigger medical_record_versions_20_validate_lineage
before insert or update of medical_record_id, version_number, version_kind, supersedes_version_id
on medical_record_versions
for each row execute function public.validate_clinical_version_lineage();

create trigger medical_record_versions_30_validate_final
before insert or update of status on medical_record_versions
for each row execute function public.validate_final_medical_record_version();

create trigger medical_records_20_validate_current_version
before insert or update of registration_id, patient_id, author_doctor_id, current_version_id,
  lifecycle_status
on medical_records
for each row execute function public.validate_medical_record_current_version();

create trigger medical_actions_10_protect_parent_version
before insert or update or delete on medical_actions
for each row execute function public.protect_medical_version_child();

create trigger prescriptions_10_protect_final
before insert or update or delete on prescriptions
for each row execute function public.protect_prescription();

create trigger prescriptions_20_validate_final
before insert or update of status on prescriptions
for each row execute function public.validate_final_prescription();

create trigger prescription_items_10_protect_final
before insert or update or delete on prescription_items
for each row execute function public.protect_prescription_item();

-- Processing audit ----------------------------------------------------------

create table audit_logs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  clinic_timezone text not null default 'Asia/Jakarta',
  actor_user_id bigint references users (id) on delete restrict,
  actor_username_snapshot text,
  actor_role_snapshot text,
  session_id bigint,
  patient_id bigint references patients (id) on delete restrict,
  registration_id bigint references registrations (id) on delete restrict,
  resource_type text not null,
  resource_public_id uuid,
  before_version_id bigint references medical_record_versions (id) on delete restrict,
  after_version_id bigint references medical_record_versions (id) on delete restrict,
  action text not null,
  outcome text not null,
  purpose text,
  reason text,
  request_id text not null,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_logs_public_id_unique unique (public_id),
  constraint audit_logs_session_actor_fk
    foreign key (session_id, actor_user_id)
    references sessions (id, user_id)
    on delete restrict,
  constraint audit_logs_session_actor_present check (
    session_id is null or actor_user_id is not null
  ),
  constraint audit_logs_actor_snapshot_present check (
    actor_user_id is null
    or (
      actor_username_snapshot is not null
      and char_length(btrim(actor_username_snapshot)) > 0
      and actor_role_snapshot is not null
    )
  ),
  constraint audit_logs_actor_role_valid check (
    actor_role_snapshot is null
    or actor_role_snapshot in ('ADMINISTRATOR', 'REGISTRATION_OFFICER', 'DOCTOR', 'SYSTEM')
  ),
  constraint audit_logs_resource_type_not_blank check (char_length(btrim(resource_type)) > 0),
  constraint audit_logs_action_not_blank check (char_length(btrim(action)) > 0),
  constraint audit_logs_request_id_valid check (
    request_id ~ '^[A-Za-z0-9._-]{1,100}$'
  ),
  constraint audit_logs_outcome_valid check (outcome in ('SUCCESS', 'DENIED', 'FAILURE')),
  constraint audit_logs_failure_reason_present check (
    outcome = 'SUCCESS'
    or (reason is not null and char_length(btrim(reason)) > 0)
  ),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_occurred_at_idx on audit_logs (occurred_at desc, id desc);
create index audit_logs_actor_user_idx on audit_logs (actor_user_id, occurred_at desc, id desc);
create index audit_logs_session_id_idx on audit_logs (session_id);
create index audit_logs_patient_idx on audit_logs (patient_id, occurred_at desc, id desc);
create index audit_logs_registration_id_idx on audit_logs (registration_id);
create index audit_logs_resource_idx
  on audit_logs (resource_type, resource_public_id, occurred_at desc, id desc);
create index audit_logs_before_version_id_idx on audit_logs (before_version_id);
create index audit_logs_after_version_id_idx on audit_logs (after_version_id);
create index audit_logs_action_idx on audit_logs (action, occurred_at desc, id desc);
create index audit_logs_request_id_idx on audit_logs (request_id, occurred_at desc, id desc);

-- Shared immutability and maintenance triggers -----------------------------

create trigger registration_status_history_no_update_or_delete
before update or delete on registration_status_history
for each row execute function public.reject_append_only_mutation();

create trigger registration_status_history_no_truncate
before truncate on registration_status_history
for each statement execute function public.reject_append_only_mutation();

create trigger queue_call_events_no_update_or_delete
before update or delete on queue_call_events
for each row execute function public.reject_append_only_mutation();

create trigger queue_call_events_no_truncate
before truncate on queue_call_events
for each statement execute function public.reject_append_only_mutation();

create trigger queue_status_history_no_update_or_delete
before update or delete on queue_status_history
for each row execute function public.reject_append_only_mutation();

create trigger queue_status_history_no_truncate
before truncate on queue_status_history
for each statement execute function public.reject_append_only_mutation();

create trigger audit_logs_no_update_or_delete
before update or delete on audit_logs
for each row execute function public.reject_append_only_mutation();

create trigger audit_logs_no_truncate
before truncate on audit_logs
for each statement execute function public.reject_append_only_mutation();

create trigger users_90_set_updated_at
before update on users for each row execute function public.set_updated_at();
create trigger permissions_90_set_updated_at
before update on permissions for each row execute function public.set_updated_at();
create trigger sessions_90_set_updated_at
before update on sessions for each row execute function public.set_updated_at();
create trigger doctors_90_set_updated_at
before update on doctors for each row execute function public.set_updated_at();
create trigger polyclinics_90_set_updated_at
before update on polyclinics for each row execute function public.set_updated_at();
create trigger queue_lanes_90_set_updated_at
before update on queue_lanes for each row execute function public.set_updated_at();
create trigger payers_90_set_updated_at
before update on payers for each row execute function public.set_updated_at();
create trigger medications_90_set_updated_at
before update on medications for each row execute function public.set_updated_at();
create trigger patients_90_set_updated_at
before update on patients for each row execute function public.set_updated_at();
create trigger registrations_90_set_updated_at
before update on registrations for each row execute function public.set_updated_at();
create trigger queue_counters_90_set_updated_at
before update on queue_counters for each row execute function public.set_updated_at();
create trigger queues_90_set_updated_at
before update on queues for each row execute function public.set_updated_at();
create trigger medical_records_90_set_updated_at
before update on medical_records for each row execute function public.set_updated_at();
create trigger medical_record_versions_90_set_updated_at
before update on medical_record_versions for each row execute function public.set_updated_at();
create trigger medical_actions_90_set_updated_at
before update on medical_actions for each row execute function public.set_updated_at();
create trigger prescriptions_90_set_updated_at
before update on prescriptions for each row execute function public.set_updated_at();
create trigger prescription_items_90_set_updated_at
before update on prescription_items for each row execute function public.set_updated_at();

create trigger patients_80_increment_row_version
before update on patients for each row execute function public.increment_row_version();
create trigger registrations_80_increment_row_version
before update on registrations for each row execute function public.increment_row_version();
create trigger queues_80_increment_row_version
before update on queues for each row execute function public.increment_row_version();
create trigger medical_records_80_increment_row_version
before update on medical_records for each row execute function public.increment_row_version();
create trigger medical_record_versions_80_increment_row_version
before update on medical_record_versions for each row execute function public.increment_row_version();
create trigger prescriptions_80_increment_row_version
before update on prescriptions for each row execute function public.increment_row_version();

comment on column users.public_id is 'Only identifier exposed through the public API.';
comment on column patients.medical_record_number is
  'Stable clinic-facing identifier; generated from a dedicated concurrency-safe sequence.';
comment on column registrations.service_date is
  'Clinic operating date calculated in Asia/Jakarta by the application.';
comment on column queues.sequence_number is
  'Immutable daily display sequence; requeue changes service_order only.';
comment on table registration_status_history is
  'Domain services must update registration state and append its history in the same transaction.';
comment on table queue_status_history is
  'Domain services must update queue state and append its history in the same transaction.';
comment on table queue_call_events is
  'Domain services must increment call_count and append each call event in the same transaction.';
comment on table medical_record_versions is
  'Final rows and their clinical children are immutable; corrections create a new version.';
comment on table audit_logs is
  'Append-only processing trail. Never store secrets or complete clinical payloads in metadata.';

commit;
