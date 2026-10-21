export const TASK_LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
]

const LANGUAGE_ALIASES = {
  js: 'javascript',
  py: 'python',
  'c++': 'cpp',
  cs: 'csharp',
}

export const normalizeTaskLanguage = (language) => {
  const normalized = LANGUAGE_ALIASES[language] || language
  return TASK_LANGUAGES.some(({ value }) => value === normalized) ? normalized : 'python'
}
