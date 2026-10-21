-- KARRAS Virtual Lab: fresh Supabase/Postgres schema.
--
-- This is the single-run Postgres counterpart to database/mysql_schema.sql.
-- Run it once in the SQL Editor of a NEW Supabase project. It creates the
-- application tables, signup profile trigger, RLS policies, submission RPC,
-- and public PDF bucket. It is not a migration for an existing database.
--
-- Supabase Auth owns passwords. public.users stores the app profile and uses
-- the Auth user UUID as its primary key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Institutions and academic structure
-- ---------------------------------------------------------------------------

CREATE TABLE public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    school_code VARCHAR(50) NOT NULL,
    location VARCHAR(255),
    website VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX institutions_school_code_upper_key
    ON public.institutions (UPPER(school_code));

CREATE TABLE public.faculties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, code)
);

CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (faculty_id, code)
);

-- ---------------------------------------------------------------------------
-- User profiles
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
    full_name VARCHAR(255) NOT NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    faculty_id UUID REFERENCES public.faculties(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    matric_no VARCHAR(100) UNIQUE,
    admission_year INTEGER,
    serial_no VARCHAR(20),
    faculty VARCHAR(255),
    department VARCHAR(255),
    level INTEGER CHECK (level IS NULL OR level IN (100, 200, 300, 400, 500, 600)),
    phone VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX users_institution_role_idx ON public.users (institution_id, role);
CREATE INDEX users_department_idx ON public.users (department_id);

-- ---------------------------------------------------------------------------
-- Manuals and tasks
-- ---------------------------------------------------------------------------

CREATE TABLE public.manuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    course_code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    semester VARCHAR(50),
    manual_pdf_url TEXT,
    deadline TIMESTAMPTZ NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    import_batch_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX manuals_institution_idx ON public.manuals (institution_id);
CREATE INDEX manuals_instructor_created_idx ON public.manuals (instructor_id, created_at DESC);

CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    instruction_text TEXT,
    pdf_section_label VARCHAR(255),
    pdf_page_start INTEGER,
    pdf_page_end INTEGER,
    language VARCHAR(50) NOT NULL DEFAULT 'python',
    starter_code TEXT,
    expected_output TEXT,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manual_id, order_index)
);
CREATE INDEX tasks_manual_order_idx ON public.tasks (manual_id, order_index);

-- ---------------------------------------------------------------------------
-- Enrollments and task submissions
-- ---------------------------------------------------------------------------

CREATE TABLE public.manual_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manual_id, student_id)
);
CREATE INDEX manual_enrollments_student_idx ON public.manual_enrollments (student_id);

CREATE TABLE public.task_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    code TEXT,
    draft_code TEXT,
    submitted_at TIMESTAMPTZ,
    auto_passed BOOLEAN,
    run_output TEXT,
    grade INTEGER,
    feedback TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'submitted', 'graded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, student_id)
);
CREATE INDEX task_submissions_student_manual_idx ON public.task_submissions (student_id, manual_id);
CREATE INDEX task_submissions_task_idx ON public.task_submissions (task_id);
CREATE INDEX task_submissions_institution_idx ON public.task_submissions (institution_id);

-- ---------------------------------------------------------------------------
-- Shared helpers and updated_at triggers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE FUNCTION public.auth_user_institution_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT institution_id FROM public.users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_institution_id() TO anon, authenticated;

CREATE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER institutions_touch_updated_at
    BEFORE UPDATE ON public.institutions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER faculties_touch_updated_at
    BEFORE UPDATE ON public.faculties
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER departments_touch_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER users_touch_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER manuals_touch_updated_at
    BEFORE UPDATE ON public.manuals
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tasks_touch_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER task_submissions_touch_updated_at
    BEFORE UPDATE ON public.task_submissions
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Supabase Auth signup provisions the profile and institution records.
-- Signup metadata is populated by the app's student/instructor/admin forms.
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    metadata JSONB := NEW.raw_user_meta_data;
    account_role TEXT := COALESCE(metadata ->> 'role', 'student');
    institution_row public.institutions%ROWTYPE;
    faculty_row public.faculties%ROWTYPE;
    department_row public.departments%ROWTYPE;
    admission_year_value INTEGER;
    serial_value TEXT;
BEGIN
    IF account_role NOT IN ('admin', 'instructor', 'student') THEN
        RAISE EXCEPTION 'Unsupported account role';
    END IF;

    IF account_role = 'admin' THEN
        IF NULLIF(BTRIM(metadata ->> 'institution_name'), '') IS NULL
           OR NULLIF(BTRIM(metadata ->> 'school_code'), '') IS NULL THEN
            RAISE EXCEPTION 'Institution name and school code are required';
        END IF;

        INSERT INTO public.institutions (name, school_code, location, website)
        VALUES (
            BTRIM(metadata ->> 'institution_name'),
            UPPER(BTRIM(metadata ->> 'school_code')),
            NULLIF(BTRIM(metadata ->> 'location'), ''),
            NULLIF(BTRIM(metadata ->> 'website'), '')
        )
        RETURNING * INTO institution_row;

        INSERT INTO public.faculties (institution_id, name, code)
        VALUES (
            institution_row.id,
            COALESCE(NULLIF(BTRIM(metadata ->> 'faculty_name'), ''), 'Faculty of Computing'),
            UPPER(COALESCE(NULLIF(BTRIM(metadata ->> 'faculty_code'), ''), 'CP'))
        )
        RETURNING * INTO faculty_row;

        INSERT INTO public.departments (institution_id, faculty_id, name, code)
        VALUES (
            institution_row.id,
            faculty_row.id,
            COALESCE(NULLIF(BTRIM(metadata ->> 'department_name'), ''), 'Computer Science'),
            UPPER(COALESCE(NULLIF(BTRIM(metadata ->> 'department_code'), ''), 'CSC'))
        )
        RETURNING * INTO department_row;
    ELSE
        SELECT * INTO institution_row
        FROM public.institutions
        WHERE UPPER(school_code) = UPPER(BTRIM(metadata ->> 'school_code'))
        LIMIT 1;
        IF institution_row.id IS NULL THEN
            RAISE EXCEPTION 'School code "%" does not exist', metadata ->> 'school_code';
        END IF;

        SELECT * INTO department_row
        FROM public.departments
        WHERE id = NULLIF(metadata ->> 'department_id', '')::UUID
          AND institution_id = institution_row.id
        LIMIT 1;
        IF department_row.id IS NULL THEN
            RAISE EXCEPTION 'Selected department does not exist in this institution';
        END IF;

        SELECT * INTO faculty_row
        FROM public.faculties
        WHERE id = department_row.faculty_id;

        IF account_role = 'student' THEN
            admission_year_value := COALESCE(
                NULLIF(metadata ->> 'admission_year', '')::INTEGER,
                EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
            );
            serial_value := COALESCE(
                NULLIF(BTRIM(metadata ->> 'serial_no'), ''),
                FLOOR(1000 + RANDOM() * 9000)::INTEGER::TEXT
            );
            IF LENGTH(serial_value) < 4 THEN
                serial_value := LPAD(serial_value, 4, '0');
            END IF;
        END IF;
    END IF;

    INSERT INTO public.users (
        id, email, role, full_name, institution_id, faculty_id, department_id,
        matric_no, admission_year, serial_no, faculty, department, level, phone
    )
    VALUES (
        NEW.id,
        NEW.email,
        account_role,
        COALESCE(NULLIF(BTRIM(metadata ->> 'full_name'), ''), NEW.email),
        institution_row.id,
        faculty_row.id,
        department_row.id,
        CASE WHEN account_role = 'student'
            THEN CONCAT_WS('/', admission_year_value::TEXT, faculty_row.code, department_row.code, serial_value)
            ELSE NULL
        END,
        admission_year_value,
        serial_value,
        faculty_row.name,
        department_row.name,
        NULLIF(metadata ->> 'level', '')::INTEGER,
        NULLIF(BTRIM(metadata ->> 'phone'), '')
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- A manual's institution is derived from its owning instructor, not accepted
-- from client input.
CREATE FUNCTION public.set_manual_institution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT institution_id INTO NEW.institution_id
    FROM public.users
    WHERE id = NEW.instructor_id AND role = 'instructor';

    IF NEW.institution_id IS NULL THEN
        RAISE EXCEPTION 'Manual owner must be an instructor linked to an institution';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER manuals_set_institution
    BEFORE INSERT OR UPDATE ON public.manuals
    FOR EACH ROW EXECUTE FUNCTION public.set_manual_institution();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.institutions, public.faculties, public.departments
    TO anon, authenticated;
GRANT UPDATE ON public.institutions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faculties, public.departments
    TO authenticated;
GRANT SELECT ON public.users, public.manuals, public.tasks,
    public.manual_enrollments, public.task_submissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.manuals, public.tasks,
    public.manual_enrollments TO authenticated;

CREATE POLICY institutions_read_for_registration
    ON public.institutions FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY institutions_admin_update_own
    ON public.institutions FOR UPDATE TO authenticated
    USING (public.auth_user_role() = 'admin' AND id = public.auth_user_institution_id())
    WITH CHECK (public.auth_user_role() = 'admin' AND id = public.auth_user_institution_id());

CREATE POLICY faculties_read_for_registration
    ON public.faculties FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY faculties_admin_manage_own
    ON public.faculties FOR ALL TO authenticated
    USING (public.auth_user_role() = 'admin' AND institution_id = public.auth_user_institution_id())
    WITH CHECK (public.auth_user_role() = 'admin' AND institution_id = public.auth_user_institution_id());

CREATE POLICY departments_read_for_registration
    ON public.departments FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY departments_admin_manage_own
    ON public.departments FOR ALL TO authenticated
    USING (public.auth_user_role() = 'admin' AND institution_id = public.auth_user_institution_id())
    WITH CHECK (public.auth_user_role() = 'admin' AND institution_id = public.auth_user_institution_id());

CREATE POLICY users_read_own_profile
    ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY institution_staff_read_profiles
    ON public.users FOR SELECT TO authenticated
    USING (
        institution_id = public.auth_user_institution_id()
        AND public.auth_user_role() IN ('admin', 'instructor')
    );
CREATE POLICY students_read_instructor_profiles
    ON public.users FOR SELECT TO authenticated
    USING (
        institution_id = public.auth_user_institution_id()
        AND role = 'instructor'
        AND public.auth_user_role() = 'student'
    );

CREATE POLICY instructors_manage_own_manuals
    ON public.manuals FOR ALL TO authenticated
    USING (
        public.auth_user_role() = 'instructor'
        AND instructor_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'instructor'
        AND instructor_id = auth.uid()
    );
CREATE POLICY students_read_published_manuals
    ON public.manuals FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'student'
        AND published
        AND (institution_id IS NULL OR institution_id = public.auth_user_institution_id())
    );
CREATE POLICY admins_read_own_institution_manuals
    ON public.manuals FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

CREATE POLICY instructors_manage_own_manual_tasks
    ON public.tasks FOR ALL TO authenticated
    USING (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = tasks.manual_id AND m.instructor_id = auth.uid()
        )
    )
    WITH CHECK (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = tasks.manual_id AND m.instructor_id = auth.uid()
        )
    );
CREATE POLICY students_read_tasks_of_published_manuals
    ON public.tasks FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'student'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = tasks.manual_id
              AND m.published
              AND (m.institution_id IS NULL OR m.institution_id = public.auth_user_institution_id())
        )
    );

CREATE POLICY students_manage_own_enrollments
    ON public.manual_enrollments FOR ALL TO authenticated
    USING (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = manual_enrollments.manual_id
              AND m.published
              AND (m.institution_id IS NULL OR m.institution_id = public.auth_user_institution_id())
        )
    );
CREATE POLICY instructors_read_own_manual_enrollments
    ON public.manual_enrollments FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = manual_enrollments.manual_id AND m.instructor_id = auth.uid()
        )
    );

CREATE POLICY students_read_own_task_submissions
    ON public.task_submissions FOR SELECT TO authenticated
    USING (public.auth_user_role() = 'student' AND student_id = auth.uid());
CREATE POLICY instructors_read_own_manual_submissions
    ON public.task_submissions FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = task_submissions.manual_id AND m.instructor_id = auth.uid()
        )
    );
CREATE POLICY admins_read_institution_submissions
    ON public.task_submissions FOR SELECT TO authenticated
    USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

-- Writes go through this RPC so the authenticated student identity, enrollment,
-- deadline, and expected output are checked by Postgres.
CREATE FUNCTION public.save_task_submission(
    p_task_id UUID,
    p_manual_id UUID,
    p_code TEXT,
    p_draft_code TEXT,
    p_submitted_at TIMESTAMPTZ,
    p_auto_passed BOOLEAN,
    p_run_output TEXT,
    p_feedback TEXT,
    p_status TEXT
)
RETURNS public.task_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    saved public.task_submissions%ROWTYPE;
    expected_output TEXT;
    deadline_at TIMESTAMPTZ;
    institution UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'student' THEN
        RAISE EXCEPTION 'Only signed-in students may save submissions';
    END IF;
    IF p_status NOT IN ('not_started', 'in_progress', 'submitted') THEN
        RAISE EXCEPTION 'Invalid submission status';
    END IF;

    SELECT t.expected_output, m.deadline, m.institution_id
    INTO expected_output, deadline_at, institution
    FROM public.tasks t
    JOIN public.manuals m ON m.id = t.manual_id
    WHERE t.id = p_task_id
      AND m.id = p_manual_id
      AND m.published
      AND (m.institution_id IS NULL OR m.institution_id = public.auth_user_institution_id());
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task is not available for this manual';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.manual_enrollments e
        WHERE e.manual_id = p_manual_id AND e.student_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Enroll in this manual before saving work';
    END IF;

    SELECT * INTO saved
    FROM public.task_submissions
    WHERE task_id = p_task_id AND student_id = auth.uid();
    IF FOUND AND saved.auto_passed IS TRUE AND saved.status IN ('submitted', 'graded') THEN
        RETURN saved;
    END IF;

    IF p_status = 'submitted' THEN
        IF deadline_at <= NOW() THEN
            RAISE EXCEPTION 'The submission deadline has passed';
        END IF;
        IF COALESCE(BTRIM(p_code), '') = '' THEN
            RAISE EXCEPTION 'An answer is required before submitting';
        END IF;
        IF COALESCE(BTRIM(expected_output), '') = ''
           OR p_auto_passed IS DISTINCT FROM TRUE
           OR BTRIM(REPLACE(COALESCE(p_run_output, ''), E'\r\n', E'\n'))
              <> BTRIM(REPLACE(expected_output, E'\r\n', E'\n')) THEN
            RAISE EXCEPTION 'The answer must run and match the expected output before it can be submitted';
        END IF;
    END IF;

    INSERT INTO public.task_submissions (
        task_id, student_id, manual_id, institution_id, code, draft_code,
        submitted_at, auto_passed, run_output, feedback, status
    )
    VALUES (
        p_task_id, auth.uid(), p_manual_id, institution, COALESCE(p_code, ''),
        p_draft_code, p_submitted_at, p_auto_passed, p_run_output,
        p_feedback, p_status
    )
    ON CONFLICT (task_id, student_id) DO UPDATE SET
        manual_id = EXCLUDED.manual_id,
        institution_id = EXCLUDED.institution_id,
        code = EXCLUDED.code,
        draft_code = EXCLUDED.draft_code,
        submitted_at = EXCLUDED.submitted_at,
        auto_passed = EXCLUDED.auto_passed,
        run_output = EXCLUDED.run_output,
        feedback = EXCLUDED.feedback,
        status = EXCLUDED.status,
        updated_at = NOW()
    RETURNING * INTO saved;

    RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_task_submission(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_task_submission(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.task_submissions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Supabase Storage for manual PDFs
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('manuals', 'manuals', TRUE, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY manuals_public_pdf_read
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'manuals');
CREATE POLICY instructors_upload_own_manual_pdfs
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'manuals'
        AND public.auth_user_role() = 'instructor'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );
CREATE POLICY instructors_update_own_manual_pdfs
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'manuals'
        AND public.auth_user_role() = 'instructor'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    )
    WITH CHECK (
        bucket_id = 'manuals'
        AND public.auth_user_role() = 'instructor'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );
CREATE POLICY instructors_delete_own_manual_pdfs
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'manuals'
        AND public.auth_user_role() = 'instructor'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );
