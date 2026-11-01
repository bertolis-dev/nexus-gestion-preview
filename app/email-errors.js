/**
 * Refus de Brevo ou de la base traduit en français, avec la marche à suivre : la cause la plus
 * fréquente d'un e-mail qui ne part pas est un réglage du compte Brevo, pas l'application.
 */
const RULES = [
  [
    /unrecognised IP|unrecognized IP|authorised_ips|authorized_ips/i,
    'Brevo bloque l’adresse IP des serveurs : dans Brevo, ouvrez Sécurité › IP autorisées et désactivez le blocage des adresses IP inconnues (ou ajoutez celle indiquée dans le message de Brevo).',
  ],
  [
    /Key not found|invalid api key|api-key/i,
    'Clé Brevo refusée : vérifiez-la dans Brevo (SMTP et API › Clés API), puis relancez courriel.configurer avec la bonne clé.',
  ],
  [
    /sender.*(not valid|invalid|not allowed|unverified)|not a valid sender|valid sender/i,
    'L’adresse d’expéditeur n’est pas validée dans Brevo : ouvrez Expéditeurs, domaines et IP › Expéditeurs, et cliquez sur le lien de confirmation reçu à cette adresse.',
  ],
  [
    /not (yet )?activated|account.*(activat|suspend|blocked)|permission_denied|HTTP 403/i,
    'Votre compte Brevo n’est pas encore activé pour l’envoi d’e-mails : dans Brevo, ouvrez « SMTP et API » et demandez l’activation (ou écrivez au support Brevo). C’est en général fait en moins d’une journée.',
  ],
  [
    /Extension http|extensions\.http|function .*http.* does not exist|schema "extensions"/i,
    'L’extension http est inactive dans Supabase : ouvrez Database › Extensions, cherchez « http » et activez-la.',
  ],
  [/pas encore configuré/i, 'L’envoi n’est pas encore configuré : lancez courriel.configurer(clé Brevo, adresse d’expéditeur) dans l’éditeur SQL de Supabase.'],
  [/timeout|timed out|canceling statement/i, 'Brevo n’a pas répondu à temps : réessayez dans un instant.'],
];

export function explainEmailError(detail) {
  const text = String(detail || '');
  return RULES.find(([re]) => re.test(text))?.[1] || (text ? `Refus du service d’e-mails : ${text}` : 'Refus du service d’e-mails, sans motif indiqué.');
}
