import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  primaryShade: 7,
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: { fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontWeight: '750' },
  components: {
    Button: { defaultProps: { radius: 'md' }, styles: { root: { minHeight: 48, fontWeight: 700 } } },
    ActionIcon: { styles: { root: { minWidth: 44, minHeight: 44 } } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
  },
});
