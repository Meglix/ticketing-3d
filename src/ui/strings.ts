/**
 * Every user-visible string of the overlay, in Romanian. Keeping them in one
 * place makes copy review (and a future translation) a one-file job.
 */
export const strings = {
  tagline: 'Vezi terenul de pe locul tău',
  demoBadge: 'Demo – geometrie aproximativă',

  legendTitle: 'Prețuri demo',
  legendNote: 'Prețuri orientative, doar pentru demonstrație',
  legendToggleShow: 'Arată prețurile',
  legendToggleHide: 'Ascunde prețurile',
  pressNotForSale: 'Presă – nu se vinde',

  hintTouch: 'Atinge un sector pentru a vedea priveliștea de pe loc',
  hintMouse: 'Apasă pe un sector pentru a vedea priveliștea de pe loc',
  inTransit: 'Te ducem la locul tău…',

  fromPrice: (lei: string) => `de la ${lei}`,
  notForSale: 'Nu se vinde',
  notForSalePress: 'Nu se vinde (presă)',
  accessibleNote: 'Loc pentru persoane cu dizabilități',
  vipNote: 'Zonă VIP',
  pressNote: 'Tribuna presei',
  estimatedNote: 'Poziție estimată',

  // Seat panel
  panelLabel: 'Locul selectat',
  fieldRing: 'Inel',
  fieldSector: 'Sector',
  fieldRow: 'Rând',
  fieldSeat: 'Loc',
  fieldPrice: 'Preț',
  perTicket: '/ bilet',
  buy: 'Cumpără',
  back: 'Înapoi la stadion',
  dragHint: 'Trage pentru a privi în jur',

  // Checkout
  checkoutTitle: 'Finalizează rezervarea',
  checkoutDemoBanner: 'Demo – fără plată reală',
  checkoutDemoExplain: 'Nicio plată nu este procesată și nu se cer date personale.',
  eventLabel: 'Eveniment demo',
  eventName: 'Meci de fotbal – eveniment demonstrativ',
  quantity: 'Număr de bilete',
  quantityHint: 'Locuri alăturate, în același rând',
  decrease: 'Mai puține bilete',
  increase: 'Mai multe bilete',
  total: 'Total',
  confirm: 'Confirmă rezervarea (demo)',
  cancel: 'Renunță',
  close: 'Închide',
  closeDialog: 'Închide fereastra',
  successTitle: 'Rezervare demo confirmată',
  /** Read together with successTitle: "Rezervare demo confirmată. Nu a fost procesată nicio plată." */
  successBody: 'Nu a fost procesată nicio plată.',
  reference: 'Cod rezervare demo',
  seatsFrom: (row: number, first: number, last: number) =>
    first === last ? `Rândul ${row}, locul ${first}` : `Rândul ${row}, locurile ${first}–${last}`,

  // Loader
  loading: 'Se încarcă stadionul…',
  loadingSlow: 'Durează mai mult decât de obicei. Aplicația are nevoie de un browser cu WebGL activat.',

  // Config error
  configErrorTitle: 'Configurația locației este invalidă',
  unknownVenueTitle: 'Locație necunoscută',
  unknownVenueBody: 'Adresa cere o locație care nu există în această versiune a demo-ului.',
  sceneFailureTitle: {
    'no-webgl': 'Vizualizarea 3D nu poate porni',
    'context-lost': 'Vizualizarea 3D s-a oprit',
    crash: 'A apărut o eroare în vizualizarea 3D',
  },
  sceneFailureBody: {
    'no-webgl':
      'Acest browser nu are WebGL activat. Deschide demo-ul într-un browser recent (Chrome, Safari, Edge, Firefox) cu accelerarea grafică pornită.',
    'context-lost':
      'Placa grafică a oprit desenarea (de exemplu după o pauză lungă sau lipsă de memorie). Reîncarcă pagina pentru a continua.',
    crash: 'Ceva nu a mers cum trebuie. Reîncarcă pagina pentru a încerca din nou.',
  },
  reload: 'Reîncarcă pagina',
  configErrorBody:
    'Aplicația nu pornește cu date greșite. Corectează fișierul de configurare al locației și reîncarcă pagina.',
} as const;
