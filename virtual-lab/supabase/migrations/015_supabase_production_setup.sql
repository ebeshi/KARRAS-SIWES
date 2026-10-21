-- Production schema for the Supabase Auth, Postgres, and Storage app.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    school_code TEXT NOT NULL,
    location TEXT,
    website TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS institutions_school_code_upper_key
    ON public.institutions (UPPER(school_code));
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.faculties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, code),
    UNIQUE (id, institution_id)
);
ALTER TABLE public.faculties ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (faculty_id, code),
    FOREIGN KEY (faculty_id, institution_id)
        REFERENCES public.faculties(id, institution_id) ON DELETE CASCADE,
    UNIQUE (id, institution_id)
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check,
    ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'instructor', 'student')),
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS faculty_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID,
    ADD COLUMN IF NOT EXISTS admission_year INTEGER,
    ADD COLUMN IF NOT EXISTS serial_no TEXT;

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_faculty_id_fkey,
    ADD CONSTRAINT users_faculty_id_fkey FOREIGN KEY (faculty_id, institution_id)
        REFERENCES public.faculties(id, institution_id) ON DELETE SET NULL,
    DROP CONSTRAINT IF EXISTS users_department_id_fkey,
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id, institution_id)
        REFERENCES public.departments(id, institution_id) ON DELETE SET NULL;

ALTER TABLE public.manuals
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL;

ALTER TABLE public.task_submissions
    ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_user_institution_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT institution_id FROM public.users WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.auth_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_institution_id() TO anon, authenticated;

DROP POLICY IF EXISTS "public read institutions" ON public.institutions;
CREATE POLICY "public read institutions" ON public.institutions
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage own institution" ON public.institutions;
CREATE POLICY "admins manage own institution" ON public.institutions
    FOR UPDATE USING (
        public.auth_user_role() = 'admin'
        AND id = public.auth_user_institution_id()
    )
    WITH CHECK (
        public.auth_user_role() = 'admin'
        AND id = public.auth_user_institution_id()
    );

DROP POLICY IF EXISTS "public read faculties" ON public.faculties;
CREATE POLICY "public read faculties" ON public.faculties
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage own faculties" ON public.faculties;
CREATE POLICY "admins manage own faculties" ON public.faculties
    FOR ALL USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    )
    WITH CHECK (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

DROP POLICY IF EXISTS "public read departments" ON public.departments;
CREATE POLICY "public read departments" ON public.departments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage own departments" ON public.departments;
CREATE POLICY "admins manage own departments" ON public.departments
    FOR ALL USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    )
    WITH CHECK (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

DROP POLICY IF EXISTS "users read own" ON public.users;
DROP POLICY IF EXISTS "instructors read all users" ON public.users;
DROP POLICY IF EXISTS "instructors read users" ON public.users;
DROP POLICY IF EXISTS "students read instructor profiles" ON public.users;
DROP POLICY IF EXISTS "institution members read profiles" ON public.users;
CREATE POLICY "users read own" ON public.users
    FOR SELECT USING (id = auth.uid());
CREATE POLICY "institution members read profiles" ON public.users
    FOR SELECT USING (
        institution_id = public.auth_user_institution_id()
        AND public.auth_user_role() IN ('admin', 'instructor')
    );
CREATE POLICY "students read instructor profiles" ON public.users
    FOR SELECT USING (
        institution_id = public.auth_user_institution_id()
        AND role = 'instructor'
        AND public.auth_user_role() = 'student'
    );

CREATE OR REPLACE FUNCTION public.handle_new_user()
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
    matric_value TEXT;
BEGIN
    IF account_role NOT IN ('admin', 'instructor', 'student') THEN
        RAISE EXCEPTION 'Unsupported account role';
    END IF;

    IF account_role = 'admin' THEN
        INSERT INTO public.institutions (name, school_code, location, website)
        VALUES (
            NULLIF(BTRIM(metadata ->> 'institution_name'), ''),
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
    ELSIF NULLIF(BTRIM(metadata ->> 'school_code'), '') IS NOT NULL THEN
        SELECT * INTO institution_row
        FROM public.institutions
        WHERE UPPER(school_code) = UPPER(BTRIM(metadata ->> 'school_code'))
        LIMIT 1;
        IF institution_row.id IS NULL THEN
            RAISE EXCEPTION 'School code "%" does not exist', metadata ->> 'school_code';
        END IF;

        SELECT d.* INTO department_row
        FROM public.departments d
        WHERE d.id = NULLIF(metadata ->> 'department_id', '')::UUID
          AND d.institution_id = institution_row.id
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
                LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0')
            );
            serial_value := LPAD(serial_value, 4, '0');
            matric_value := admission_year_value::TEXT || '/' || faculty_row.code || '/'
                || department_row.code || '/' || serial_value;
        END IF;
    END IF;

    INSERT INTO public.users (
        id, email, role, full_name, institution_id, faculty_id, department_id,
        faculty, department, level, phone, admission_year, serial_no, matric_no
    )
    VALUES (
        NEW.id,
        NEW.email,
        account_role,
        COALESCE(NULLIF(BTRIM(metadata ->> 'full_name'), ''), NEW.email),
        institution_row.id,
        faculty_row.id,
        department_row.id,
        faculty_row.name,
        department_row.name,
        NULLIF(metadata ->> 'level', '')::INTEGER,
        NULLIF(BTRIM(metadata ->> 'phone'), ''),
        admission_year_value,
        serial_value,
        matric_value
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_manual_institution()
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
        RAISE EXCEPTION 'Manual owner must be an instructor in an institution';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_manual_institution_before_write ON public.manuals;
CREATE TRIGGER set_manual_institution_before_write
    BEFORE INSERT OR UPDATE ON public.manuals
    FOR EACH ROW EXECUTE FUNCTION public.set_manual_institution();

UPDATE public.manuals m
SET institution_id = u.institution_id
FROM public.users u
WHERE u.id = m.instructor_id AND m.institution_id IS NULL;

UPDATE public.task_submissions ts
SET institution_id = u.institution_id
FROM public.users u
WHERE u.id = ts.student_id AND ts.institution_id IS NULL;

DROP POLICY IF EXISTS "students read published manuals" ON public.manuals;
CREATE POLICY "students read published manuals" ON public.manuals
    FOR SELECT USING (
        public.auth_user_role() = 'student'
        AND published = TRUE
        AND (institution_id IS NULL OR institution_id = public.auth_user_institution_id())
    );
DROP POLICY IF EXISTS "admins read own institution manuals" ON public.manuals;
CREATE POLICY "admins read own institution manuals" ON public.manuals
    FOR SELECT USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

DROP POLICY IF EXISTS "students read tasks of published manuals" ON public.tasks;
CREATE POLICY "students read tasks of published manuals" ON public.tasks
    FOR SELECT USING (
        public.auth_user_role() = 'student'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = tasks.manual_id
              AND m.published = TRUE
              AND (m.institution_id IS NULL OR m.institution_id = public.auth_user_institution_id())
        )
    );

DROP POLICY IF EXISTS "students enroll themselves" ON public.manual_enrollments;
CREATE POLICY "students enroll themselves" ON public.manual_enrollments
    FOR ALL USING (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = manual_enrollments.manual_id
              AND m.published = TRUE
              AND (m.institution_id IS NULL OR m.institution_id = public.auth_user_institution_id())
        )
    );

DROP POLICY IF EXISTS "admins read own institution submissions" ON public.task_submissions;
CREATE POLICY "admins read own institution submissions" ON public.task_submissions
    FOR SELECT USING (
        public.auth_user_role() = 'admin'
        AND institution_id = public.auth_user_institution_id()
    );

CREATE OR REPLACE FUNCTION public.save_task_submission(
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
    task_expected_output TEXT;
    manual_deadline TIMESTAMPTZ;
    institution UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'student' THEN
        RAISE EXCEPTION 'Only signed-in students may save submissions';
    END IF;
    IF p_status NOT IN ('not_started', 'in_progress', 'submitted') THEN
        RAISE EXCEPTION 'Invalid submission status';
    END IF;

    SELECT t.expected_output, m.deadline, m.institution_id
    INTO task_expected_output, manual_deadline, institution
    FROM public.tasks t
    JOIN public.manuals m ON m.id = t.manual_id
    WHERE t.id = p_task_id
      AND m.id = p_manual_id
      AND m.published = TRUE
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

    IF p_status IN ('submitted', 'graded') THEN
        IF manual_deadline <= NOW() THEN
            RAISE EXCEPTION 'The submission deadline has passed';
        END IF;
        IF COALESCE(BTRIM(p_code), '') = '' THEN
            RAISE EXCEPTION 'An answer is required before submitting';
        END IF;
        IF COALESCE(BTRIM(task_expected_output), '') = ''
           OR p_auto_passed IS DISTINCT FROM TRUE
           OR BTRIM(REPLACE(COALESCE(p_run_output, ''), E'\r\n', E'\n'))
              <> BTRIM(REPLACE(task_expected_output, E'\r\n', E'\n')) THEN
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
        NULL, p_status
    )
    ON CONFLICT (task_id, student_id) DO UPDATE SET
        code = EXCLUDED.code,
        draft_code = EXCLUDED.draft_code,
        submitted_at = EXCLUDED.submitted_at,
        auto_passed = EXCLUDED.auto_passed,
        run_output = EXCLUDED.run_output,
        status = EXCLUDED.status,
        updated_at = NOW()
    RETURNING * INTO saved;
    RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_task_submission(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_task_submission(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.task_submissions FROM anon, authenticated;

DROP POLICY IF EXISTS "Instructors upload manuals" ON storage.objects;
CREATE POLICY "Instructors upload manuals"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'manuals'
    AND public.auth_user_role() = 'instructor'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Instructors update manuals" ON storage.objects;
CREATE POLICY "Instructors update manuals"
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

DROP POLICY IF EXISTS "Instructors delete manuals" ON storage.objects;
CREATE POLICY "Instructors delete manuals"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'manuals'
    AND public.auth_user_role() = 'instructor'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);
