import type {PoolClient} from 'pg';

export type SocialHeroPolicy = {draftEnabled: boolean; publishEnabled: boolean};

/** Read the current destination policy before credential locks, never a cached principal. */
export async function currentSocialHeroPolicy(c: PoolClient, destinationId?: string, lock: 'share' | 'update' = 'share'): Promise<SocialHeroPolicy> {
  const siteId = process.env.BLOG_SITE_ID ?? 'dartspoint';
  const environment = process.env.APP_ENV ?? 'development';
  if (!destinationId) {
    const row = (await c.query(`select publish_enabled from private.socialhero_settings where site_id=$1 and environment=$2 for ${lock}`, [siteId, environment])).rows[0];
    return {draftEnabled: true, publishEnabled: !!row?.publish_enabled};
  }
  const row = (await c.query(`select draft_enabled,publish_enabled from private.socialhero_destination_policies where site_id=$1 and environment=$2 and destination_id=$3 for ${lock}`, [siteId, environment, destinationId])).rows[0];
  return {draftEnabled: !!row?.draft_enabled, publishEnabled: !!row?.draft_enabled && !!row?.publish_enabled};
}
