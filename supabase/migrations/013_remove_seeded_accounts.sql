-- Remove legacy demo/test accounts and their auth records.
DELETE FROM auth.users
WHERE LOWER(email) IN (
    'admin@fulafia.edu.ng',
    'ibrahim.musa@fulafia.edu.ng',
    'instructor@demo.com',
    'instructor.chukwu@oau.edu.ng',
    'student@demo.com',
    'ola.adeyemi.200489@oau.edu.ng',
    'precious.okafor.200512@oau.edu.ng'
);

-- Also remove bootstrap profiles that were created without a corresponding auth user.
DELETE FROM public.users
WHERE LOWER(email) IN (
    'admin@fulafia.edu.ng',
    'ibrahim.musa@fulafia.edu.ng',
    'instructor@demo.com',
    'instructor.chukwu@oau.edu.ng',
    'student@demo.com',
    'ola.adeyemi.200489@oau.edu.ng',
    'precious.okafor.200512@oau.edu.ng'
);
