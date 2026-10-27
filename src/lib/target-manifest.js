export const TARGETS = ['chrome', 'firefox', 'safari'];

const GECKO_ID = 'acdl-debugger@andylunsford';

function withoutSidePanel(base, dropPermissions = []) {
  const m = structuredClone(base);
  delete m.side_panel;
  m.permissions = m.permissions.filter(p => p !== 'sidePanel' && !dropPermissions.includes(p));
  return m;
}

const transforms = {
  chrome: (base) => structuredClone(base),

  firefox(base) {
    const m = withoutSidePanel(base);
    m.background = { scripts: [base.background.service_worker] };
    m.sidebar_action = {
      default_panel: base.side_panel.default_path,
      default_title: base.action.default_title,
      default_icon: base.action.default_icon,
      open_at_install: false
    };
    m.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] }
      }
    };
    return m;
  },

  safari(base) {
    const m = withoutSidePanel(base, ['downloads']);
    m.action.default_popup = base.side_panel.default_path.replace(/index\.html$/, 'popup.html');
    m.browser_specific_settings = { safari: { strict_min_version: '17.5' } };
    return m;
  }
};

export function manifestForTarget(base, target) {
  if (!Object.hasOwn(transforms, target)) throw new Error(`Unknown target: ${target}`);
  return transforms[target](base);
}
