/**
 * The version, in the bottom-left corner of every screen: small, dim and out
 * of the way — there to say which build this is when something is reported,
 * not to be read in play. The commit it was built from is on point.
 */
export function Version() {
  const commit = __APP_COMMIT__;
  return (
    <span className="version" title={commit ? `Build ${commit}` : undefined}>
      v{__APP_VERSION__}
    </span>
  );
}
