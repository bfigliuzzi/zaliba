/**
 * Engendre la clé de signature ES256 de la pile Supabase locale.
 *
 * **Elle n'est pas dans le dépôt, et ne le sera jamais** : c'est une clé
 * *privée*, fût-elle de développement. `supabase/.gitignore` l'exclut, et ce
 * script est ce qui rend son absence sans conséquence — un poste neuf comme un
 * exécutant d'intégration continue la reproduit en une commande.
 *
 * **Pourquoi ES256 et pas le secret partagé par défaut.** R12 exige une
 * vérification *asymétrique* : la même clé ne doit pas pouvoir signer **et**
 * vérifier, sans quoi sa fuite depuis l'API permet de se faire passer pour
 * n'importe qui. `signing_keys_path` fait servir à GoTrue un JWKS public sur
 * `/auth/v1/.well-known/jwks.json`, et l'API n'y récupère que de quoi vérifier.
 *
 * **Aucune dépendance.** `node:crypto` sait exporter un JWK depuis une clé EC
 * P-256 ; passer par `jose` obligerait à exécuter ce script depuis le paquet qui
 * le déclare, c'est-à-dire à faire dépendre l'amorçage de la pile locale d'une
 * dépendance de `apps/api`. La pile n'appartient à aucune application.
 *
 * **`key_ops` n'est pas décoratif.** GoTrue choisit sa clé de signature sur la
 * présence de `sign` dans ce tableau — `use: "sig"` seul ne suffit pas. Sans lui,
 * le démarrage échoue sur `no signing key found`, ce qui laisse croire à un
 * fichier absent alors qu'il est simplement incomplet. La CLI valide par
 * ailleurs `kid` comme un UUID et `key_ops` comme un tableau de **deux** entrées
 * exactement.
 *
 * Usage :
 *
 * ```sh
 * node scripts/generate-signing-keys.mjs [chemin] [--force]
 * ```
 *
 * Le refus d'écraser est le comportement par défaut : régénérer la clé d'une
 * pile en fonctionnement invalide tous les jetons déjà émis, et le symptôme —
 * des requêtes soudainement rejetées en 401 — ne nomme pas sa cause.
 */

import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const args = process.argv.slice(2)
const force = args.includes('--force')
const target = args.find((arg) => !arg.startsWith('--')) ?? 'supabase/signing_keys.json'

if (existsSync(target) && !force) {
  process.stdout.write(
    `${target} existe déjà — rien de fait.\n` +
      'Régénérer invaliderait les jetons déjà émis par la pile en cours. ' +
      'Passer --force pour le vouloir explicitement.\n',
  )
  process.exit(0)
}

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const { crv, x, y, d } = privateKey.export({ format: 'jwk' })

const jwks = [
  {
    kty: 'EC',
    kid: randomUUID(),
    use: 'sig',
    key_ops: ['sign', 'verify'],
    alg: 'ES256',
    ext: true,
    d,
    crv,
    x,
    y,
  },
]

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, `${JSON.stringify(jwks, null, 2)}\n`, 'utf8')

process.stdout.write(`Clé de signature ES256 écrite dans ${target}\n`)
