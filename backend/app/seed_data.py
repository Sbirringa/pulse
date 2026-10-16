"""Dati iniziali: città, categorie e domande curate.

Le domande sono formulate in modo neutrale e la descrizione riporta le ragioni di entrambe le parti.
Il seed è idempotente: ogni domanda ha una seed_key e viene inserita solo se manca.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Question

CITIES = [
    "Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze", "Bari",
    "Catania", "Venezia", "Verona", "Messina", "Padova", "Trieste", "Brescia", "Parma",
    "Taranto", "Prato", "Modena", "Reggio Calabria", "Reggio Emilia", "Perugia", "Ravenna",
    "Livorno", "Cagliari", "Foggia", "Rimini", "Salerno", "Ferrara", "Sassari", "Latina",
    "Monza", "Siracusa", "Pescara", "Bergamo", "Forlì", "Trento", "Vicenza", "Terni",
    "Bolzano", "Novara", "Piacenza", "Ancona", "Udine", "Arezzo", "Lecce",
]

CATEGORIES = [
    "Lavoro", "Sanità", "Scuola", "Ambiente", "Trasporti", "Casa", "Economia",
    "Diritti", "Giustizia", "Tecnologia", "Partecipazione", "Città",
]

NATIONAL = [
    ("n01", "Lavoro", "Settimana lavorativa di 4 giorni a parità di stipendio",
     "Chi è favorevole cita benessere e produttività; chi è contrario teme costi per le imprese e servizi pubblici scoperti."),
    ("n02", "Lavoro", "Un salario minimo orario fissato per legge",
     "Favorevoli: protegge i lavori peggio pagati. Contrari: rischia di indebolire la contrattazione collettiva e il lavoro regolare."),
    ("n03", "Lavoro", "Stage e tirocini sempre retribuiti",
     "Favorevoli: evita lavoro gratuito mascherato. Contrari: potrebbe ridurre il numero di posti offerti ai giovani."),
    ("n04", "Sanità", "Più fondi alla sanità pubblica, anche riducendo altre voci di spesa",
     "Favorevoli: liste d'attesa e personale sono il problema. Contrari: servono prima efficienza e riorganizzazione."),
    ("n05", "Sanità", "Tempi massimi garantiti per visite ed esami, con rimborso se vengono superati",
     "Favorevoli: un diritto esigibile. Contrari: costi elevati e rischio di favorire il privato."),
    ("n06", "Scuola", "Vietare gli smartphone in classe in tutte le scuole",
     "Favorevoli: più attenzione e meno distrazioni. Contrari: strumento didattico utile, meglio educare all'uso."),
    ("n07", "Scuola", "Educazione finanziaria e civica come materia autonoma",
     "Favorevoli: competenze per la vita adulta. Contrari: programmi già pieni, meglio integrarle nelle materie esistenti."),
    ("n08", "Scuola", "Stipendi più alti per i docenti, con differenze legate a sede e impegno",
     "Favorevoli: attira personale e premia chi lavora in zone difficili. Contrari: rischio di valutazioni arbitrarie."),
    ("n09", "Ambiente", "Tornare a produrre energia nucleare in Italia",
     "Favorevoli: energia stabile e a basse emissioni. Contrari: costi, tempi, scorie e sicurezza."),
    ("n10", "Ambiente", "Più impianti eolici e fotovoltaici a terra, anche se cambiano il paesaggio",
     "Favorevoli: transizione energetica più rapida. Contrari: tutela del paesaggio e consumo di suolo."),
    ("n11", "Ambiente", "Stop alla vendita di auto nuove a benzina e diesel dal 2035",
     "Favorevoli: riduce le emissioni. Contrari: costi per le famiglie e impatto sull'industria."),
    ("n12", "Casa", "Un grande piano pubblico di case a prezzo calmierato per giovani e famiglie",
     "Favorevoli: affitti e prezzi fuori portata. Contrari: spesa pubblica elevata e tempi lunghi."),
    ("n13", "Casa", "Tassare di più le case lasciate vuote da anni",
     "Favorevoli: rimette alloggi sul mercato. Contrari: colpisce anche chi non riesce a vendere o affittare."),
    ("n14", "Economia", "Ridurre le tasse sul lavoro, anche a costo di ridurre altri servizi",
     "Favorevoli: più stipendio netto e più assunzioni. Contrari: meno risorse per sanità, scuola e welfare."),
    ("n15", "Economia", "Un reddito minimo per chi è in povertà assoluta, con obbligo di formazione o lavoro",
     "Favorevoli: rete di sicurezza e reinserimento. Contrari: costi, abusi e scarsa efficacia nel collocare le persone."),
    ("n16", "Diritti", "Ridurre da 10 a 5 anni la residenza richiesta per chiedere la cittadinanza",
     "Favorevoli: integrazione più rapida. Contrari: servono tempi lunghi per verificare un radicamento reale."),
    ("n17", "Diritti", "Permettere ai fuorisede di votare senza tornare nel comune di residenza",
     "Favorevoli: più partecipazione. Contrari: complessità organizzativa e garanzie sul voto."),
    ("n18", "Diritti", "Abbassare a 16 anni l'età per votare",
     "Favorevoli: coinvolge i giovani prima. Contrari: maturità e informazione ancora in formazione."),
    ("n19", "Giustizia", "Più pene alternative al carcere per i reati minori",
     "Favorevoli: riduce il sovraffollamento e la recidiva. Contrari: percezione di impunità."),
    ("n20", "Tecnologia", "Identità digitale (SPID/CIE) obbligatoria per aprire un account sui social",
     "Favorevoli: meno bot e abusi. Contrari: rischi per privacy e libertà di espressione."),
    ("n21", "Tecnologia", "Limiti di età più rigidi ai social network sotto i 15 anni",
     "Favorevoli: tutela di minori e salute mentale. Contrari: difficile da far rispettare, meglio l'educazione digitale."),
    ("n22", "Tecnologia", "Obbligo di etichettare i contenuti generati dall'intelligenza artificiale",
     "Favorevoli: trasparenza contro la disinformazione. Contrari: difficile da controllare e può frenare l'innovazione."),
    ("n23", "Trasporti", "Più investimenti nelle ferrovie regionali che nelle grandi opere",
     "Favorevoli: servizio quotidiano per pendolari. Contrari: le grandi opere sono strategiche per la crescita."),
    ("n24", "Trasporti", "Un abbonamento nazionale unico ai trasporti pubblici, a prezzo ridotto per gli under 26",
     "Favorevoli: mobilità accessibile e meno auto. Contrari: costo per lo Stato e differenze territoriali nel servizio."),
    ("n25", "Partecipazione", "Rendere il voto obbligatorio alle elezioni",
     "Favorevoli: contrasta l'astensione. Contrari: il voto è una libertà, anche quella di non esercitarlo."),
    ("n26", "Partecipazione", "Referendum più facili da proporre, con raccolta firme online",
     "Favorevoli: più partecipazione diretta. Contrari: rischio di decisioni emotive su temi complessi."),
]

# Domande locali: valgono per ogni città della lista, con il nome della città nel titolo.
LOCAL_TEMPLATES = [
    ("l1", "Trasporti", "{city}: più piste ciclabili, anche riducendo i parcheggi su strada?",
     "Favorevoli: più sicurezza e meno traffico. Contrari: meno posti auto per chi ne ha davvero bisogno."),
    ("l2", "Trasporti", "{city}: corse serali e notturne più frequenti dei mezzi pubblici, anche se costa di più?",
     "Favorevoli: sicurezza e vita serale anche senza auto. Contrari: costi elevati con pochi passeggeri."),
    ("l3", "Città", "{city}: ampliare le zone a traffico limitato nel centro?",
     "Favorevoli: aria più pulita e spazi per le persone. Contrari: difficoltà per residenti e commercianti."),
    ("l4", "Ambiente", "{city}: più alberi e verde pubblico, anche al posto di alcuni spazi asfaltati?",
     "Favorevoli: meno caldo in estate e più qualità della vita. Contrari: costi di manutenzione e perdita di parcheggi."),
    ("l5", "Casa", "{city}: limitare gli affitti brevi turistici per favorire gli affitti a lungo termine?",
     "Favorevoli: più case per residenti e studenti. Contrari: reddito per i proprietari e vantaggi per il turismo."),
]


def seed_questions(db: Session) -> int:
    existing = set(db.scalars(select(Question.seed_key).where(Question.seed_key.is_not(None))))
    created = 0
    for key, category, title, description in NATIONAL:
        if key in existing:
            continue
        db.add(Question(seed_key=key, title=title, description=description,
                        category=category, scope="national", status="approved"))
        created += 1
    for city in CITIES:
        for key, category, title, description in LOCAL_TEMPLATES:
            seed_key = f"{key}:{city.lower().replace(' ', '-')}"
            if seed_key in existing:
                continue
            db.add(Question(seed_key=seed_key, title=title.format(city=city),
                            description=description, category=category,
                            scope="local", city=city, status="approved"))
            created += 1
    if created:
        db.commit()
    return created
