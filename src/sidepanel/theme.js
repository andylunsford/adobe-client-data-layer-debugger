import { applyTheme, loadTheme } from '../lib/theme.js';

applyTheme(document.documentElement, loadTheme(localStorage));
