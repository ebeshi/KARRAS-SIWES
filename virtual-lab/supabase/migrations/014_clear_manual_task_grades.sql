-- Manual scores are awarded only at the manual level (40 on full completion).
UPDATE public.task_submissions
SET grade = NULL
WHERE grade IS NOT NULL;

UPDATE public.tasks
SET points = 0
WHERE points <> 0;
