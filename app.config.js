// Override opsional untuk EAS project id.
// app.json adalah sumber utama; nilai di sana masih placeholder
// (00000000-...) sampai project EAS dibuat dengan `eas init` / `eas build`.
// Set env EAS_PROJECT_ID untuk mengisi projectId & updates.url yang asli
// tanpa mengubah file yang dikomit, mis.:
//   EAS_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx eas update --branch production --message "..."
module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID;
  if (!projectId) {
    return config;
  }
  return {
    ...config,
    updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` },
    extra: {
      ...config.extra,
      eas: { ...(config.extra && config.extra.eas), projectId },
    },
  };
};
