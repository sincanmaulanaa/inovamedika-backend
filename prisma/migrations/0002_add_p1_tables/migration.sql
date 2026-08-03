CREATE TABLE public.correction_requests (
    id bigserial PRIMARY KEY,
    public_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    medical_record_id bigint NOT NULL REFERENCES public.medical_records(id),
    requested_by_user_id bigint NOT NULL REFERENCES public.users(id),
    requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by_user_id bigint REFERENCES public.users(id),
    approved_at timestamptz,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX correction_requests_mr_idx ON public.correction_requests(medical_record_id);
