import type { BuildingTypeId, Curve, GongLength, ObstacleId, ResourceId } from '@zaliba/catalogs'
import { GRAINS_PER_UNIT } from '@zaliba/catalogs'
import { type Catalogs, type DeclaredCatalogs, evaluateCurve } from '@zaliba/domain'
import type React from 'react'
import { formatWhole } from '../../lib/format.js'
import {
  BUILDING_LABELS,
  DEPOSIT_LABELS,
  OBSTACLE_LABELS,
  RESOURCE_LABELS,
} from '../../lib/labels.js'

/**
 * **Les règles du jeu, générées depuis le catalogue** (R15, FR-054, US8).
 *
 * Rien ici n'est un chiffre rédigé. Chaque valeur est lue de `catalogs`, chaque
 * formule est énoncée avec ses paramètres, et chaque arrondi est **situé** — parce
 * qu'un joueur qui refait `15 × (11/10)^4` obtient 21,96 là où le jeu compte 21, et
 * conclurait qu'il s'est trompé. Une page qui donne un calcul *presque* juste est pire
 * qu'une page absente.
 *
 * **Le catalogue est un argument**, comme partout ailleurs dans ce dépôt. Ce n'est pas
 * une commodité de test : c'est ce qui rend la promesse vérifiable. Un test peut
 * rendre cette page contre un catalogue synthétique et constater que **ce sont ses
 * valeurs** qui s'affichent — la seule formulation qui distingue « la page affiche les
 * bons chiffres » de « la page lit le catalogue ».
 *
 * **Ce que la page ne fait pas.** Elle n'affiche aucune valeur propre à une planète :
 * ni quantité détenue, ni chantier, ni production courante. C'est une page de
 * *règles*, pas un tableau de bord — et elle doit rester lisible sans être connecté,
 * puisque son sujet est ce qui vaut pour tous.
 *
 * **Ce qu'elle publie a changé de nature avec 003**, et la nuance décide de ce
 * qu'elle a à confronter. Elle publiait « le catalogue qu'elle embarque » ; elle
 * publie désormais ce catalogue **résolu par la longueur du serveur**. La
 * première moitié — coûts, empreintes, plafonds, énergie, et les durées en gongs
 * — vient toujours du bundle et ne dépend de personne. La seconde — les secondes
 * et les taux par heure — vient d'un chiffre que le serveur a annoncé, et n'existe
 * donc que si un instantané a été reçu. C'est pourquoi cette page a maintenant
 * **deux états**, là où elle en avait un.
 *
 * **La table des niveaux s'arrête à dix**, et le paramètre de la courbe prend le
 * relais. Trente lignes par type feraient cent cinquante lignes de tableau que
 * personne ne lit ; la fraction, elle, permet de calculer le niveau trente-et-un.
 *
 * ## Depuis 003 : deux catalogues, et deux colonnes
 *
 * Le catalogue **déclare** ses durées en gongs et ses productions en grains par
 * gong ; le serveur les **résout** en secondes avec la longueur de son gong. La
 * page publie les deux — le gong parce que c'est ce que le catalogue dit, la
 * seconde parce que c'est ce que le joueur vit — et **énonce la longueur** qui
 * fait passer de l'un à l'autre. Sans elle, la moitié des chiffres de cette page
 * serait invérifiable, ce qui reviendrait à une formule cachée.
 *
 * **Elle publie aussi la base résolue**, et c'est le point qui évite le piège :
 * hors gong canonique, `12 gongs × 1/6 s` ne donne pas la durée du niveau 3 en
 * divisant celle du canonique. La résolution porte sur la **base** de la courbe,
 * puis la courbe est évaluée — une seule troncature, en fin de calcul. Un joueur
 * qui multiplie de tête tomberait à côté et conclurait qu'il s'est trompé.
 *
 * **Et elle est lisible sans compte.** La page n'appelle aucune route : hors
 * session, elle ne connaît pas la longueur du serveur. Elle publie alors les
 * gongs seuls — des valeurs déclarées, pas des chiffres dérivés —, **dit** que
 * la longueur ne lui est pas connue, et n'affiche **aucune seconde** (FR-013).
 * Afficher des secondes calculées avec une longueur supposée serait exactement
 * la faute que la vérification de version a déjà nommée.
 */

export interface RulesContentProps {
  /** Le catalogue **déclaré**, embarqué dans le bundle : en gongs. */
  readonly declared: DeclaredCatalogs
  /**
   * Le catalogue **résolu** à la longueur du serveur, ou `null` tant qu'aucun
   * instantané de planète n'a été reçu. `null` n'est pas une erreur : c'est
   * l'état normal d'un visiteur qui lit les règles sans être connecté.
   */
  readonly resolved: Catalogs | null
}

/** Les niveaux tabulés. Au-delà, la fraction de la courbe suffit. */
const SHOWN_LEVELS = [1, 2, 3, 5, 10] as const

/** Une quantité en grains, rendue en unités entières — ce que le joueur compte. */
function units(grains: number): string {
  return formatWhole(Math.floor(grains / GRAINS_PER_UNIT))
}

/**
 * Une courbe, énoncée avec **ses paramètres**.
 *
 * C'est ce que FR-054 demande au-delà des valeurs : la fraction dit *pourquoi* les
 * chiffres croissent ainsi, et permet de calculer un niveau que la table n'atteint
 * pas.
 */
function describeCurve(curve: Curve, unit: 'grains' | 'brut'): string {
  const value = (raw: number) => (unit === 'grains' ? units(raw) : formatWhole(raw))

  switch (curve.kind) {
    case 'geometric':
      return `géométrique : ⌊${value(curve.base)} × (${curve.num} ÷ ${curve.den})^(niveau − 1)⌋`
    case 'linear':
      return `linéaire : ${value(curve.base)} + ${value(curve.step)} × (niveau − 1)`
    case 'steps':
      return `table : ${curve.values.map(value).join(', ')}`
  }
}

/** Ce qu'un déblaiement révèle, dans le vocabulaire du jeu. */
function describeReveals(obstacleId: ObstacleId, catalogs: DeclaredCatalogs): string {
  const reveals = catalogs.obstacles[obstacleId]?.reveals
  if (reveals === undefined || reveals.kind === 'bare-ground') return 'terrain nu'
  return DEPOSIT_LABELS[reveals.resourceId] ?? reveals.resourceId
}

function describeCost(
  cost: Readonly<Partial<Record<ResourceId, number>>>,
  label: (id: ResourceId) => string,
): string {
  const entries = Object.entries(cost) as readonly [ResourceId, number][]
  if (entries.length === 0) return 'gratuit'
  return entries.map(([resourceId, grains]) => `${units(grains)} ${label(resourceId)}`).join(', ')
}

/**
 * Une table dans son conteneur **défilant et focalisable**.
 *
 * Les tables de cette page sont larges par nature, et elles doivent défiler dans leur
 * propre boîte plutôt que de pousser la page — un défilement horizontal du document
 * ferait perdre la grille au joueur (SC-009). Mais une région défilante qu'aucune
 * tabulation n'atteint est un écart WCAG : `scrollable-region-focusable`, que le parcours
 * d'accessibilité a attrapé dès la première mise en page.
 *
 * Le conteneur porte donc `tabIndex={0}` — on y entre au clavier, les flèches font
 * défiler — et un nom, sans lequel il serait un arrêt de tabulation muet.
 */
function ScrollableTable({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: aucun élément natif ne porte le rôle `region` avec un défilement propre ; c'est le motif que WCAG recommande pour une table large.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: la règle et WCAG se contredisent ici, et WCAG tranche. Une région défilante **doit** être focalisable — `scrollable-region-focusable`, un écart « serious » que le parcours d'accessibilité attrape —, et c'est le conteneur du défilement qui doit l'être, pas la table.
    <div className="table-defilante" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  )
}

/** La longueur du gong, telle qu'on l'écrit au joueur : « 10 s » ou « 1/2 s ». */
function describeGong(gong: GongLength): string {
  return gong.den === 1 ? `${formatWhole(gong.num)} s` : `${gong.num}/${gong.den} s`
}

export function RulesContent({ declared, resolved }: RulesContentProps) {
  const catalogs = declared
  const layout = declared.layouts['berceau-v1']
  const resolvedLayout = resolved?.layouts['berceau-v1'] ?? null
  const resourceLabel = (id: ResourceId) => RESOURCE_LABELS[id] ?? id

  if (layout === undefined) throw new RangeError('Disposition inconnue : berceau-v1.')

  return (
    <>
      <p>
        Tout ce qui suit est <strong>engendré depuis le catalogue du jeu</strong>, version{' '}
        {catalogs.version}. Aucun chiffre n’est écrit à la main : un rééquilibrage met cette page à
        jour sans qu’une phrase soit réécrite.
      </p>

      <section aria-labelledby="regles-gong">
        <h2 id="regles-gong">Le gong</h2>
        <p>
          Le catalogue déclare ses durées en <strong>gongs</strong> et ses productions en{' '}
          <strong>grains par gong</strong>. Le <strong>gong</strong> est l’unité de temps du jeu ;
          chaque serveur déclare la longueur de la sienne, et c’est elle qui décide du rythme —
          chantiers <em>et</em> accumulation de ressources, dans le même rapport.
        </p>
        {resolved === null ? (
          <p>
            <strong>La longueur du gong de ce serveur n’est pas connue de cette page.</strong> Elle
            voyage avec l’état de votre planète : connectez-vous et ouvrez votre planète, puis
            revenez ici pour voir chaque durée en secondes. En attendant, les durées ci-dessous sont
            données en <strong>gongs</strong>, tels que le catalogue les déclare.
          </p>
        ) : (
          <>
            <p>
              <strong>Sur ce serveur, un gong dure {describeGong(resolved.gong)}.</strong> Chaque
              durée est donnée ci-dessous en gongs et en secondes, et chaque production par gong et
              par heure.
            </p>
            <p>
              <strong>Attention au sens de la conversion.</strong> Une durée de niveau supérieur ne
              s’obtient pas en multipliant la durée en gongs de ce niveau par la longueur du gong :
              c’est la <strong>base</strong> de la courbe qui est convertie, <em>puis</em> la courbe
              qui est évaluée. Une seule troncature, à la fin. La base résolue est publiée avec
              chaque type, pour que le calcul se refasse à la main sans tomber à côté.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="regles-unites">
        <h2 id="regles-unites">Unités et arrondis</h2>
        <p>
          Une quantité se compte en <strong>grains</strong> : une unité vaut{' '}
          {formatWhole(GRAINS_PER_UNIT)} grains. Un taux se compte en{' '}
          <strong>unités par heure</strong>, et le choix du diviseur fait tomber la division — un
          taux d’une unité par heure produit exactement un grain par seconde.
        </p>
        <p>
          Le catalogue, lui, déclare ses taux en <strong>grains par gong</strong> et ses durées en{' '}
          <strong>gongs</strong>. C’est ce qui couple le rythme des chantiers à celui de la
          production : les deux se convertissent avec la même longueur, et ne peuvent donc pas
          diverger.
        </p>
        <p>
          <strong>Où tombent les arrondis.</strong> Il n’y en a jamais plus d’un par formule, et
          toujours à la fin : la partie entière inférieure — notée ⌊…⌋ — s’applique une seule fois,
          après toutes les multiplications. C’est ce qui rend chaque chiffre reproductible à la
          main. Multiplier puis diviser, jamais diviser puis multiplier.
        </p>
      </section>

      <section aria-labelledby="regles-production">
        <h2 id="regles-production">Production</h2>
        <p>
          Un extracteur produit <strong>par gisement recouvert</strong> :
        </p>
        <p>
          <code>
            taux nominal = ⌊production(niveau)⌋ × nombre de gisements recouverts de sa ressource
          </code>
        </p>
        <p>
          Un extracteur qui ne recouvre <strong>aucun gisement</strong> de sa ressource produit{' '}
          <strong>zéro</strong> — et non la valeur de base de son type. C’est ce qui fait du
          placement une décision.
        </p>
        <p>
          <code>taux de la planète = Σ extracteurs (après énergie) + production de base</code>
        </p>
        <p>
          La production de base de la planète s’ajoute <strong>après</strong> le rapport d’énergie
          et n’en est jamais réduite : même à zéro énergie, la planète produit.
        </p>
        <ScrollableTable label="Production et plafonds de base">
          <table>
            <caption>Production de base de la planète</caption>
            <thead>
              <tr>
                <th scope="col">Ressource</th>
                <th scope="col">Par gong</th>
                {resolvedLayout !== null && <th scope="col">Par heure</th>}
                <th scope="col">Plafond de base</th>
              </tr>
            </thead>
            <tbody>
              {catalogs.resourceIds.map((resourceId) => (
                <tr key={resourceId}>
                  <th scope="row">{resourceLabel(resourceId)}</th>
                  <td>{formatWhole(layout.baseProductionPerGong[resourceId] ?? 0)}</td>
                  {resolvedLayout !== null && (
                    <td>{formatWhole(resolvedLayout.baseProductionPerHour[resourceId] ?? 0)}</td>
                  )}
                  <td>{units(layout.baseCapacityGrains[resourceId] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>

      <section aria-labelledby="regles-energie">
        <h2 id="regles-energie">Énergie</h2>
        <p>
          L’énergie est <strong>instantanée</strong> : elle ne se stocke pas et ne s’accumule pas.
        </p>
        <p>
          <code>E₊ = énergie de base ({formatWhole(layout.baseEnergy)}) + Σ centrales</code>
          <br />
          <code>E₋ = Σ tous les autres bâtiments, l’entrepôt compris</code>
          <br />
          <code>rapport = 1 si E₋ ≤ E₊, sinon E₊ ÷ E₋</code>
        </p>
        <p>
          En déficit, le rapport multiplie <strong>les seuls taux de production</strong> :{' '}
          <code>taux effectif = ⌊nominal × E₊ ÷ E₋⌋</code>. L’égalité n’est pas un déficit. La
          capacité d’un entrepôt, elle, reste <strong>entière</strong> en déficit.
        </p>
      </section>

      <section aria-labelledby="regles-stockage">
        <h2 id="regles-stockage">Stockage et saturation</h2>
        <p>
          <code>plafond = plafond de base de la planète + Σ capacité des entrepôts posés</code>
        </p>
        <p>
          Une ressource au plafond cesse de croître, et ce qu’elle aurait produit est{' '}
          <strong>perdu</strong> — la perte est comptée et consultable. L’instant de saturation vaut{' '}
          <code>maintenant + ⌈(plafond − quantité) ÷ taux⌉</code>, arrondi vers le haut : la
          saturation survient à la seconde où elle est atteinte.
        </p>
      </section>

      <section aria-labelledby="regles-chantiers">
        <h2 id="regles-chantiers">Chantiers</h2>
        <p>
          <strong>Au plus un chantier par planète.</strong> Le coût est débité au{' '}
          <strong>lancement</strong>, l’effet appliqué à l’<strong>échéance</strong>. Un chantier
          lancé ne peut être ni annulé ni remplacé.
        </p>
        <p>
          Une <strong>amélioration</strong> emploie la courbe de coût du type, évaluée au niveau
          visé : le niveau N coûte le même prix qu’on l’atteigne par une pose ou par une
          amélioration. Elle ne change ni la variante, ni l’orientation, ni les cases occupées.
        </p>
        <p>
          Une <strong>démolition</strong> ne coûte rien et rembourse{' '}
          <code>fraction × Σ(k=1..N) coût(k)</code> — la somme des coûts de{' '}
          <strong>tous les niveaux payés</strong>, chacun déjà arrondi. Un remboursement qui
          dépasserait le plafond est écrêté, et le montant écrêté est annoncé avant confirmation.
        </p>
        <p>
          Un <strong>déblaiement</strong> lit son coût, sa durée et son résultat du{' '}
          <strong>type d’obstacle</strong> : deux cases du même type donnent le même résultat, pour
          tous les joueurs. Aucun tirage au sort.
        </p>
      </section>

      <section aria-labelledby="regles-batiments">
        <h2 id="regles-batiments">Bâtiments</h2>
        {(Object.keys(catalogs.buildings) as readonly BuildingTypeId[]).map((typeId) => {
          const type = catalogs.buildings[typeId]
          // Le même type, résolu — ou `null` tant que la longueur du serveur est
          // inconnue. Les deux se lisent côte à côte, jamais l'un à la place de
          // l'autre : le gong est ce que le catalogue déclare, la seconde ce que
          // le joueur vit.
          const become = resolved?.buildings[typeId] ?? null
          const label = BUILDING_LABELS[typeId] ?? typeId

          return (
            <section key={typeId} aria-label={label}>
              <h3>{label}</h3>
              <dl>
                <dt>Empreintes admissibles</dt>
                <dd>{type.variants.join(', ')}</dd>

                <dt>Niveau maximal</dt>
                <dd>{formatWhole(type.maxLevel)}</dd>

                <dt>Ressource extraite</dt>
                <dd>{type.extracts === null ? 'aucune' : resourceLabel(type.extracts)}</dd>

                {Object.entries(type.cost).map(([resourceId, curve]) => (
                  <div key={resourceId}>
                    <dt>{`Coût en ${resourceLabel(resourceId as ResourceId)}`}</dt>
                    <dd>{describeCurve(curve, 'grains')}</dd>
                  </div>
                ))}

                <dt>Durée de construction, en gongs</dt>
                <dd>{describeCurve(type.buildDuration, 'brut')}</dd>

                {become !== null && (
                  <>
                    <dt>Durée de construction, en secondes</dt>
                    {/*
                      La **base résolue** est publiée, et pas seulement la durée
                      du niveau 1 : c'est elle qui permet de refaire n'importe
                      quel niveau à la main, avec une seule troncature. Diviser
                      la durée canonique donnerait un chiffre voisin et faux.
                    */}
                    <dd>{describeCurve(become.buildDuration, 'brut')}</dd>
                  </>
                )}

                {type.production !== null && (
                  <>
                    <dt>Production par gisement, en grains par gong</dt>
                    <dd>{describeCurve(type.production, 'brut')}</dd>
                  </>
                )}

                {become?.production != null && (
                  <>
                    <dt>Production par gisement, en unités par heure</dt>
                    <dd>{describeCurve(become.production, 'brut')}</dd>
                  </>
                )}

                {type.capacity !== null && (
                  <>
                    <dt>Capacité ajoutée, aux trois ressources</dt>
                    <dd>{describeCurve(type.capacity, 'grains')}</dd>
                  </>
                )}

                {type.energyConsumption !== null && (
                  <>
                    <dt>Énergie consommée</dt>
                    <dd>{describeCurve(type.energyConsumption, 'brut')}</dd>
                  </>
                )}

                {type.energyProduction !== null && (
                  <>
                    <dt>Énergie produite</dt>
                    <dd>{describeCurve(type.energyProduction, 'brut')}</dd>
                  </>
                )}

                <dt>Durée de démolition, en gongs</dt>
                <dd>{formatWhole(type.demolitionGongs)}</dd>

                {become !== null && (
                  <>
                    <dt>Durée de démolition, en secondes</dt>
                    <dd>{formatWhole(become.demolitionSeconds)}</dd>
                  </>
                )}

                <dt>Fraction remboursée</dt>
                <dd>{`${type.refund.num} ÷ ${type.refund.den}`}</dd>
              </dl>

              {/*
                La table des premiers niveaux, **calculée** : elle montre où la courbe
                mène, là où la fraction seule demande un crayon. Elle s'arrête à dix —
                trente lignes par type feraient cent cinquante lignes que personne ne
                lit, et la fraction ci-dessus permet d'aller plus loin.
              */}
              <ScrollableTable label={`${label} — valeurs par niveau`}>
                <table>
                  <caption>{`${label} — valeurs par niveau`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Niveau</th>
                      {Object.keys(type.cost).map((resourceId) => (
                        <th key={resourceId} scope="col">
                          {resourceLabel(resourceId as ResourceId)}
                        </th>
                      ))}
                      <th scope="col">Durée (gongs)</th>
                      {become !== null && <th scope="col">Durée (s)</th>}
                      {type.production !== null && (
                        <th scope="col">Production / gisement (gr/gong)</th>
                      )}
                      {become?.production != null && (
                        <th scope="col">Production / gisement (u/h)</th>
                      )}
                      {type.capacity !== null && <th scope="col">Capacité</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {SHOWN_LEVELS.filter((level) => level <= type.maxLevel).map((level) => (
                      <tr key={level}>
                        <th scope="row">{formatWhole(level)}</th>
                        {Object.entries(type.cost).map(([resourceId, curve]) => (
                          <td key={resourceId}>{units(evaluateCurve(curve, level))}</td>
                        ))}
                        <td>{formatWhole(evaluateCurve(type.buildDuration, level))}</td>
                        {become !== null && (
                          <td>{formatWhole(evaluateCurve(become.buildDuration, level))}</td>
                        )}
                        {type.production !== null && (
                          <td>{formatWhole(evaluateCurve(type.production, level))}</td>
                        )}
                        {become?.production != null && (
                          <td>{formatWhole(evaluateCurve(become.production, level))}</td>
                        )}
                        {type.capacity !== null && (
                          <td>{units(evaluateCurve(type.capacity, level))}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </section>
          )
        })}
      </section>

      <section aria-labelledby="regles-obstacles">
        <h2 id="regles-obstacles">Obstacles</h2>
        <p>
          Le résultat d’un déblaiement appartient au <strong>type d’obstacle</strong>, jamais à la
          case : qui a déblayé une fois sait ce que le prochain du même type donnera.
        </p>
        <ScrollableTable label="Déblaiement, par type d’obstacle">
          <table>
            <caption>Déblaiement, par type d’obstacle</caption>
            <thead>
              <tr>
                <th scope="col">Obstacle</th>
                <th scope="col">Coût</th>
                <th scope="col">Durée (gongs)</th>
                {resolved !== null && <th scope="col">Durée (s)</th>}
                <th scope="col">Ce qui apparaît</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(catalogs.obstacles) as readonly ObstacleId[]).map((obstacleId) => {
                const obstacle = catalogs.obstacles[obstacleId]
                if (obstacle === undefined) return null

                return (
                  <tr key={obstacleId}>
                    <th scope="row">{OBSTACLE_LABELS[obstacleId] ?? obstacleId}</th>
                    <td>{describeCost(obstacle.cost, resourceLabel)}</td>
                    <td>{formatWhole(obstacle.durationGongs)}</td>
                    {resolved !== null && (
                      <td>{formatWhole(resolved.obstacles[obstacleId]?.durationSeconds ?? 0)}</td>
                    )}
                    <td>{describeReveals(obstacleId, catalogs)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollableTable>
      </section>

      <section aria-labelledby="regles-depart">
        <h2 id="regles-depart">Au départ</h2>
        <ScrollableTable label="Stock initial de la planète">
          <table>
            <caption>Stock initial de la planète</caption>
            <thead>
              <tr>
                <th scope="col">Ressource</th>
                <th scope="col">Quantité</th>
              </tr>
            </thead>
            <tbody>
              {catalogs.resourceIds.map((resourceId) => (
                <tr key={resourceId}>
                  <th scope="row">{resourceLabel(resourceId)}</th>
                  <td>{units(layout.startingStockGrains[resourceId] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
        <p>
          La planète mesure {formatWhole(layout.width)} sur {formatWhole(layout.height)} cases, dont{' '}
          {formatWhole(layout.cells.filter((cell) => cell.obstacleId !== null).length)} obstruées.
          Elle est <strong>identique pour tous les joueurs</strong> : aucun tirage au sort, aucune
          graine.
        </p>
      </section>

      {/*
        **L'angle mort connu de la lecture du plan** (FR-035).

        Il est publié ici parce que P4 « a besoin de tout savoir », et parce que la
        promesse du projet est qu'aucune formule n'est cachée. Un défaut connu de
        lisibilité en est une : le taire laisserait un joueur croire qu'il lit mal,
        alors que c'est l'écran qui alerte mal.

        Et il est publié **dans le jeu** plutôt que dans un document de conception :
        le joueur concerné est celui qui joue, pas celui qui relit la spécification.
      */}
      <section aria-labelledby="regles-lisibilite">
        <h2 id="regles-lisibilite">Lire le plan sans distinguer les couleurs</h2>
        <p>
          Chaque état de case porte un <strong>canal non chromatique</strong> : une silhouette, un
          style de trait plein ou évidé, une marque d’angle, ou le cadre d’emprise d’un bâtiment.
          Aucune information du plan ne tient à la teinte seule, et la légende donne la clé de
          chaque forme.
        </p>
        <p>
          <strong>Un angle mort subsiste, et il est connu.</strong> Sous <strong>protanopie</strong>{' '}
          — la forme de daltonisme qui atténue le rouge —, la teinte du refus de pose se rapproche
          de l’orange de la Camelote. L’état reste identifiable : le disque barré d’une croix ne
          ressemble à aucune autre silhouette, et la case refusée nomme sa cause dans son libellé.
          Mais il <strong>alerte plus faiblement</strong> qu’il ne le devrait : le rouge y perd sa
          fonction d’avertissement, et il ne reste que la forme.
        </p>
        <p>
          C’est la contrepartie assumée d’une palette de trois ressources dont l’une est rouge
          orangé. La corriger demanderait de changer la teinte de la Camelote, qui identifie une
          ressource sur tout l’écran, ou celle du refus, qui n’a que le rouge à sa disposition dans
          la convention d’alerte.
        </p>
      </section>
    </>
  )
}
