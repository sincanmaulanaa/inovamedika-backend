-- Prisma requires all relation fields in this one-to-one relation to form a
-- unique criterion, matching the composite identity enforced by the foreign key.
create unique index medical_records_registration_identity_unique
  on public.medical_records (registration_id, patient_id, author_doctor_id);
