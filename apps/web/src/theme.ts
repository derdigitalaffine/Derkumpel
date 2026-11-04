import { createTheme } from '@mantine/core';

const fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const theme = createTheme({
  colors: {
    brand: ['#eef6f9', '#dcebf2', '#bad8e7', '#8abbd1', '#5c99b8', '#34779a', '#235c7e', '#194b6a', '#123d5b', '#0b2f49'],
  },
  primaryColor: 'brand',
  primaryShade: 7,
  defaultRadius: 'lg',
  focusRing: 'auto',
  fontFamily,
  headings: { fontFamily, fontWeight: '780', sizes: { h1: { fontSize: 'clamp(1.7rem, 5vw, 2.15rem)', lineHeight: '1.14' }, h2: { fontSize: '1.55rem', lineHeight: '1.2' } } },
  shadows: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.05)',
    sm: '0 4px 14px rgba(15, 23, 42, 0.07)',
    md: '0 10px 30px rgba(15, 23, 42, 0.10)',
    lg: '0 18px 48px rgba(15, 23, 42, 0.13)',
    xl: '0 28px 70px rgba(15, 23, 42, 0.16)',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md', size: 'md' },
      styles: { root: { minHeight: 48, fontWeight: 750, letterSpacing: '-0.015em', transition: 'background-color .15s ease, transform .15s ease, box-shadow .15s ease' } },
    },
    ActionIcon: {
      defaultProps: { radius: 'md' },
      styles: { root: { minWidth: 46, minHeight: 46, transition: 'background-color .15s ease' } },
    },
    Paper: { defaultProps: { radius: 'lg' } },
    Card: { defaultProps: { radius: 'lg' } },
    Badge: {
      defaultProps: { radius: 'sm' },
      styles: { root: { fontWeight: 750, letterSpacing: '0' } },
    },
    NavLink: {
      defaultProps: { variant: 'light' },
      styles: { root: { borderRadius: 12, minHeight: 46 }, label: { fontWeight: 700 } },
    },
    TextInput: { defaultProps: { size: 'md', radius: 'md' } },
    PasswordInput: { defaultProps: { size: 'md', radius: 'md' } },
    Textarea: { defaultProps: { size: 'md', radius: 'md' } },
    Select: { defaultProps: { size: 'md', radius: 'md' } },
    MultiSelect: { defaultProps: { size: 'md', radius: 'md' } },
    NumberInput: { defaultProps: { size: 'md', radius: 'md' } },
    Accordion: {
      styles: { control: { minHeight: 52 }, label: { fontWeight: 700 } },
    },
    Drawer: {
      defaultProps: { overlayProps: { backgroundOpacity: 0.38, blur: 3 } },
      styles: { title: { fontWeight: 800 } },
    },
    Modal: {
      defaultProps: { overlayProps: { backgroundOpacity: 0.42, blur: 3 } },
      styles: { title: { fontWeight: 800 } },
    },
  },
});
