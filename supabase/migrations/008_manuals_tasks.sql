-- 008_manuals_tasks.sql
-- Manual-first data model: Manual is the unit of a semester-long lab pack;
-- Manual contains Tasks; each Task can have page-range anchors into the Manual PDF.

-- ============
-- manuals table
-- ============
CREATE TABLE IF NOT EXISTS public.manuals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    semester TEXT,
    manual_pdf_url TEXT,
    deadline TIMESTAMPTZ NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    import_batch_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.manuals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instructors manage own manuals" ON public.manuals;
CREATE POLICY "instructors manage own manuals" ON public.manuals
    FOR ALL
    USING (
        public.auth_user_role() = 'instructor'
        AND instructor_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'instructor'
        AND instructor_id = auth.uid()
    );

DROP POLICY IF EXISTS "students read published manuals" ON public.manuals;
CREATE POLICY "students read published manuals" ON public.manuals
    FOR SELECT
    USING (
        public.auth_user_role() = 'student'
        AND published = TRUE
    );

-- ============
-- tasks table (manual -> 1..N tasks in order)
-- ============
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    order_index INT NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    instruction_text TEXT NOT NULL DEFAULT '',
    pdf_section_label TEXT,
    pdf_page_start INT,
    pdf_page_end INT,
    language TEXT NOT NULL DEFAULT 'python',
    starter_code TEXT NOT NULL DEFAULT '',
    expected_output TEXT,
    points INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manual_id, order_index)
);

CREATE INDEX IF NOT EXISTS tasks_manual_order_idx ON public.tasks (manual_id, order_index);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "instructors manage own manual tasks" ON public.tasks;
CREATE POLICY "instructors manage own manual tasks" ON public.tasks
    FOR ALL
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

DROP POLICY IF EXISTS "students read tasks of published manuals" ON public.tasks;
CREATE POLICY "students read tasks of published manuals" ON public.tasks
    FOR SELECT
    USING (
        public.auth_user_role() = 'student'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = tasks.manual_id AND m.published = TRUE
        )
    );

-- ============
-- task_submissions table (1 per student per task)
-- ============
CREATE TABLE IF NOT EXISTS public.task_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT '',
    draft_code TEXT,
    submitted_at TIMESTAMPTZ,
    auto_passed BOOLEAN,
    run_output TEXT,
    grade INT,
    feedback TEXT,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','graded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, student_id)
);

CREATE INDEX IF NOT EXISTS ts_student_manual_idx ON public.task_submissions (student_id, manual_id);
CREATE INDEX IF NOT EXISTS ts_task_idx ON public.task_submissions (task_id);

ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students manage own task submissions" ON public.task_submissions;
CREATE POLICY "students manage own task submissions" ON public.task_submissions
    FOR ALL
    USING (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    );

DROP POLICY IF EXISTS "instructors read/grade their manual submissions" ON public.task_submissions;
CREATE POLICY "instructors read/grade their manual submissions" ON public.task_submissions
    FOR ALL
    USING (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = task_submissions.manual_id AND m.instructor_id = auth.uid()
        )
    )
    WITH CHECK (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = task_submissions.manual_id AND m.instructor_id = auth.uid()
        )
    );

-- ============
-- manual_enrollments (student roster per manual / join code)
-- ============
CREATE TABLE IF NOT EXISTS public.manual_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manual_id UUID NOT NULL REFERENCES public.manuals(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manual_id, student_id)
);

ALTER TABLE public.manual_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students enroll themselves" ON public.manual_enrollments;
CREATE POLICY "students enroll themselves" ON public.manual_enrollments
    FOR ALL
    USING (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    )
    WITH CHECK (
        public.auth_user_role() = 'student'
        AND student_id = auth.uid()
    );

DROP POLICY IF EXISTS "instructors read enrollments for own manual" ON public.manual_enrollments;
CREATE POLICY "instructors read enrollments for own manual" ON public.manual_enrollments
    FOR SELECT
    USING (
        public.auth_user_role() = 'instructor'
        AND EXISTS (
            SELECT 1 FROM public.manuals m
            WHERE m.id = manual_enrollments.manual_id AND m.instructor_id = auth.uid()
        )
    );

-- ============
-- updated_at triggers
-- ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS manuals_updated_at ON public.manuals;
CREATE TRIGGER manuals_updated_at
BEFORE UPDATE ON public.manuals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS task_submissions_updated_at ON public.task_submissions;
CREATE TRIGGER task_submissions_updated_at
BEFORE UPDATE ON public.task_submissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
