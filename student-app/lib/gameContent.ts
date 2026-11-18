// Content for the CTVET games (Tool ID and Right Order), by trade.
// Written from standard trade practice for NC I / NC II; teachers should
// review it before wide use. Order matters in `procedures`: the steps are the
// correct sequence.

export interface Trade {
  key: string;
  name: string;
  tools: [tool: string, use: string][];
  procedures: { title: string; steps: string[] }[];
}

export const TRADES: Trade[] = [
  {
    key: 'electrical', name: 'Electrical Installation',
    tools: [
      ['Combination pliers', 'Gripping, twisting and cutting wires'],
      ['Side cutters', 'Cutting wires and cable cores close'],
      ['Wire stripper', 'Removing insulation without damaging the conductor'],
      ['Voltage tester', 'Checking whether a circuit is live'],
      ['Multimeter', 'Measuring voltage, current and resistance'],
      ['Insulation resistance tester', 'Testing the insulation of an installation'],
      ['Crimping tool', 'Fixing lugs and terminals onto conductors'],
      ['Bending spring', 'Bending PVC conduit without kinking it'],
      ['Draw wire', 'Pulling cables through conduit'],
      ['Insulated screwdriver', 'Tightening terminal screws safely'],
    ],
    procedures: [
      { title: 'Safe isolation before work', steps: [
        'Identify the circuit to be worked on',
        'Switch off and isolate it at the distribution board',
        'Lock it off and put up a warning notice',
        'Prove the voltage tester on a known live source',
        'Test that the circuit is dead',
        'Prove the tester again on the known live source',
        'Begin the work',
      ] },
      { title: 'Installing a one-way lighting circuit', steps: [
        'Plan the route and mark the switch and light positions',
        'Fix the conduit or trunking and the boxes',
        'Draw in the cables',
        'Connect the switch in the line conductor',
        'Connect the ceiling rose and lampholder',
        'Connect the circuit at the distribution board',
        'Test continuity and insulation before switching on',
      ] },
    ],
  },
  {
    key: 'welding', name: 'Welding and Fabrication',
    tools: [
      ['Welding helmet', 'Protecting the eyes and face from arc light and spatter'],
      ['Chipping hammer', 'Removing slag from a weld'],
      ['Wire brush', 'Cleaning metal and welds'],
      ['Angle grinder', 'Cutting and grinding metal'],
      ['Earth clamp', 'Completing the welding circuit'],
      ['Electrode holder', 'Holding the electrode and carrying current to it'],
      ['Scriber', 'Marking lines on metal'],
      ['Centre punch', 'Marking the centre of a hole before drilling'],
      ['Leather gauntlets', 'Protecting the hands from heat and sparks'],
      ['Try square', 'Checking and marking right angles'],
    ],
    procedures: [
      { title: 'Making a butt weld with an arc welder', steps: [
        'Put on the PPE: helmet, gauntlets, apron and boots',
        'Clean and prepare the edges of the plates',
        'Set the plates with a small gap and tack weld them',
        'Connect the earth clamp and set the current',
        'Strike the arc and run the weld at an even speed',
        'Chip off the slag and brush the weld',
        'Inspect the weld for defects',
      ] },
      { title: 'Marking out and cutting a steel plate', steps: [
        'Clean the surface of the plate',
        'Measure and mark the lines with a scriber and try square',
        'Centre punch along the marked lines',
        'Clamp the plate securely',
        'Cut along the line with the grinder or hacksaw',
        'Remove the burrs with a file',
      ] },
    ],
  },
  {
    key: 'building', name: 'Building Construction',
    tools: [
      ['Spirit level', 'Checking that work is level or plumb'],
      ['Plumb bob', 'Checking vertical alignment'],
      ['Trowel', 'Spreading and shaping mortar'],
      ['Line and pins', 'Keeping each course of blocks straight'],
      ['Float', 'Smoothing plaster and concrete surfaces'],
      ['Builder\'s square', 'Setting out right angles'],
      ['Club hammer and bolster', 'Cutting blocks and bricks'],
      ['Head pan', 'Carrying mortar and concrete'],
      ['Tape measure', 'Measuring lengths and distances'],
    ],
    procedures: [
      { title: 'Laying a course of blocks', steps: [
        'Check that the foundation is level',
        'Spread a bed of mortar',
        'Lay the corner blocks first and level them',
        'Stretch the line between the corner blocks',
        'Lay the blocks to the line, filling the joints',
        'Check that the course is level and plumb',
        'Point the joints',
      ] },
      { title: 'Mixing concrete by hand', steps: [
        'Measure the materials in the right ratio',
        'Mix the cement and sand dry until the colour is even',
        'Add the coarse aggregate and mix again',
        'Form a crater and add water gradually',
        'Turn the mix until it is even and workable',
        'Place the concrete before it begins to set',
      ] },
    ],
  },
  {
    key: 'wood', name: 'Wood Technology',
    tools: [
      ['Jack plane', 'Smoothing and levelling wood surfaces'],
      ['Tenon saw', 'Making fine, straight cuts for joints'],
      ['Rip saw', 'Cutting along the grain'],
      ['Cross-cut saw', 'Cutting across the grain'],
      ['Mortise chisel', 'Cutting mortises'],
      ['Marking gauge', 'Marking lines parallel to an edge'],
      ['Mallet', 'Striking chisels'],
      ['G-clamp', 'Holding work while the glue sets'],
      ['Bradawl', 'Making small starter holes for screws'],
    ],
    procedures: [
      { title: 'Making a mortise and tenon joint', steps: [
        'Plane the timber to size',
        'Mark out the joint with a try square and marking gauge',
        'Cut the tenon cheeks and shoulders with a tenon saw',
        'Chop the mortise with a mortise chisel and mallet',
        'Test the fit and adjust it',
        'Glue and clamp the joint',
      ] },
      { title: 'Finishing a wooden surface', steps: [
        'Plane the surface smooth',
        'Sand along the grain, coarse paper first, then fine',
        'Remove the dust',
        'Apply a sealer',
        'Sand lightly again',
        'Apply the varnish in thin coats',
      ] },
    ],
  },
  {
    key: 'fashion', name: 'Fashion Design',
    tools: [
      ['Tape measure', 'Taking body measurements'],
      ['Tailor\'s chalk', 'Marking lines on fabric'],
      ['Pinking shears', 'Cutting fabric edges so they fray less'],
      ['Dressmaking shears', 'Cutting out fabric'],
      ['Seam ripper', 'Removing stitches'],
      ['Tracing wheel', 'Transferring pattern markings to fabric'],
      ['Thimble', 'Protecting the finger when hand sewing'],
      ['French curve', 'Drawing curved lines on patterns'],
      ['Pressing iron', 'Pressing seams and fabric'],
    ],
    procedures: [
      { title: 'Making a simple skirt', steps: [
        'Take the measurements: waist, hip and length',
        'Draft the pattern',
        'Pin the pattern on the fabric',
        'Cut out the fabric pieces',
        'Mark the darts and seam lines',
        'Sew the darts and side seams',
        'Attach the waistband and zip',
        'Hem the skirt and press it',
      ] },
      { title: 'Threading a sewing machine', steps: [
        'Raise the needle and the presser foot',
        'Place the spool on the spool pin',
        'Guide the thread through the thread guides and tension discs',
        'Pass the thread through the take-up lever',
        'Thread the needle',
        'Draw up the bobbin thread',
      ] },
    ],
  },
  {
    key: 'catering', name: 'Hospitality and Catering',
    tools: [
      ['Chef\'s knife', 'Chopping and slicing'],
      ['Chopping board', 'A safe surface for cutting food'],
      ['Colander', 'Draining food'],
      ['Whisk', 'Beating eggs and mixing batters'],
      ['Measuring jug', 'Measuring liquids'],
      ['Kitchen scale', 'Weighing ingredients'],
      ['Food thermometer', 'Checking food is cooked or kept at a safe temperature'],
      ['Fish slice', 'Turning and lifting food in a pan'],
      ['Ladle', 'Serving soups and stews'],
      ['Grater', 'Shredding vegetables'],
    ],
    procedures: [
      { title: 'Washing hands before handling food', steps: [
        'Wet the hands with clean running water',
        'Apply soap',
        'Rub the palms, backs, between the fingers and under the nails for 20 seconds',
        'Rinse thoroughly',
        'Dry with a clean towel',
      ] },
      { title: 'Cleaning a food work surface', steps: [
        'Clear food and equipment off the surface',
        'Scrape off food debris',
        'Wash with hot soapy water',
        'Rinse with clean water',
        'Apply sanitiser and leave it for the contact time',
        'Leave the surface to air dry',
      ] },
    ],
  },
  {
    key: 'computer', name: 'Computer Hardware',
    tools: [
      ['Anti-static wrist strap', 'Preventing static damage to components'],
      ['Phillips screwdriver', 'Removing and fitting case screws'],
      ['Multimeter', 'Testing power supply voltages'],
      ['Cable tester', 'Checking network cables'],
      ['RJ45 crimping tool', 'Fitting connectors to network cables'],
      ['Thermal paste', 'Helping heat pass from the processor to the cooler'],
      ['Compressed air', 'Blowing dust out of a computer'],
      ['Punch-down tool', 'Fixing network wires into a patch panel'],
    ],
    procedures: [
      { title: 'Assembling a computer', steps: [
        'Put on an anti-static wrist strap',
        'Fit the processor into the motherboard socket',
        'Apply thermal paste and fit the processor cooler',
        'Install the memory (RAM)',
        'Mount the motherboard in the case',
        'Install the storage drive',
        'Connect the power supply cables',
        'Close the case and switch on to test',
      ] },
      { title: 'Making a straight-through network cable', steps: [
        'Cut the cable to length',
        'Strip about 2 cm of the outer jacket',
        'Untwist the pairs and arrange the wires in T568B order',
        'Trim the wires to an even length',
        'Push the wires fully into the RJ45 connector',
        'Crimp the connector',
        'Test the cable with a cable tester',
      ] },
    ],
  },
];
