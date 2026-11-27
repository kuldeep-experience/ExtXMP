import { useState } from 'react';

// Minimal controlled-form helper: const [values, field, setValues] = useForm({ email: '' })
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const field = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return [values, field, setValues];
}
