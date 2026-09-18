export function watchlistOrigin(url: string): string {
  return `*://${new URL(url).hostname}/*`;
}

/** Called from an explicit Add/Watch button; denial intentionally remains passive. */
export async function requestWatchlistPermission(url: string): Promise<boolean> {
  return await browser.permissions.request({
    permissions: ["webNavigation"],
    origins: [watchlistOrigin(url)],
  });
}

export async function revokeWatchlistPermission(url: string): Promise<boolean> {
  return await browser.permissions.remove({ origins: [watchlistOrigin(url)] });
}
