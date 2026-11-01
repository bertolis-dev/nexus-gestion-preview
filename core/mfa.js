/**
 * Double authentification : plusieurs applications d'authentification peuvent être enregistrées
 * (téléphone principal, second téléphone ou gestionnaire de mots de passe). Un appareil de secours
 * évite de perdre l'accès à la comptabilité avec son téléphone. Le dernier appareil ne se retire pas.
 */

const verifiedOf = (factors) => (factors || []).filter((x) => x.status === 'verified');

/** État à partir du niveau d'assurance et des facteurs renvoyés par Supabase Auth. */
export function mfaState(aal, factors) {
  const verified = verifiedOf(factors).map((x) => ({ id: x.id, name: x.friendly_name || 'Application d’authentification', createdAt: x.created_at || null }));
  const backup = verified.length > 1;
  if (aal?.currentLevel === 'aal2') return { step: 'ok', factors: verified, backup };
  if (verified.length) return { step: 'challenge', factorId: verified[0].id, factors: verified, backup };
  return { step: 'enroll', factors: [], backup: false };
}

export function canRemoveFactor(factors, id) {
  const verified = verifiedOf(factors);
  return verified.length > 1 && verified.some((x) => x.id === id);
}
