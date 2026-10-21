-- Apply this once to an existing Supabase database created from an older
-- version of schema.sql. Do not rerun the full schema on an initialized DB.

CREATE OR REPLACE FUNCTION public.normalize_task_output(output_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT regexp_replace(
        replace(COALESCE(output_text, ''), E'\r\n', E'\n'),
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
    )
$$;

DO $$
DECLARE
    function_definition TEXT;
    old_run_comparison TEXT := $old$BTRIM(REPLACE(COALESCE(p_run_output, ''), E'\r\n', E'\n'))$old$;
    old_expected_comparison TEXT := $old$BTRIM(REPLACE(expected_output, E'\r\n', E'\n'))$old$;
BEGIN
    SELECT pg_get_functiondef(
        'public.save_task_submission(uuid,uuid,text,text,timestamptz,boolean,text,text,text)'::regprocedure
    )
    INTO function_definition;

    IF POSITION(old_run_comparison IN function_definition) = 0
       OR POSITION(old_expected_comparison IN function_definition) = 0 THEN
        IF POSITION('public.normalize_task_output(p_run_output)' IN function_definition) > 0 THEN
            RAISE NOTICE 'Task output comparison is already normalized.';
            RETURN;
        END IF;
        RAISE EXCEPTION 'Could not find the expected save_task_submission comparison; no changes were applied.';
    END IF;

    function_definition := REPLACE(
        function_definition,
        old_run_comparison,
        'public.normalize_task_output(p_run_output)'
    );
    function_definition := REPLACE(
        function_definition,
        old_expected_comparison,
        'public.normalize_task_output(expected_output)'
    );

    EXECUTE function_definition;
END
$$;
