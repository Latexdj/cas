'use strict';
/**
 * Shared Subject App list (Playlab AI) for Teacher Resources.
 * Loads the apps as shared links (school_id NULL), seen by every school
 * that has the Teacher Resources module on. Schools can hide any of them.
 *
 * Run: node backend/seed-subject-apps.js
 * Safe to re-run: an existing form + subject is updated (link and order), not duplicated.
 * Some subjects share a link on purpose (Intervention Maths/English, Accounting).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false } });

const GROUP_ORDER = ['Form 1', 'Form 2', 'New SHS Curriculum (All Forms)'];

const P = id => `https://www.playlab.ai/project/${id}`;
const APPS = {
  'Form 1': [
    ['Mathematics', 'cmd959ml706q6k60u7e66i89u'],
    ['Intervention Mathematics', 'cmfocc5ql0hasm40uqjmty9d9'],
    ['General Science', 'cmd94ugn006q9jq0uu4ntg6y1'],
    ['Social Studies', 'cmd95sy3u06qzgn0uww395d6c'],
    ['English Language', 'cmdxx258702r9os0ukf1zoqke'],
    ['Intervention English Language', 'cmfocc5ql0hasm40uqjmty9d9'],
    ['Elective ICT', 'cmd952nfd05sdju0uns2559uz'],
    ['Economics', 'cmd94ee7j05skgn0uk2rvfvyg'],
    ['History', 'cmd950t2e05e4ix0u7vezzc72'],
    ['Religious Studies', 'cmdw9ntmi2h2and0ug3r5stay'],
    ['Accounting', 'cmeojcma2036fgk0u4pscv17f'],
    ['Management-in-Living', 'cmekev1070atdll0udetpyfqp'],
    ['Biology', 'cmd93v07f06h5ji0uae4zk9lj'],
    ['Food & Nutrition', 'cmdw9c1rr2i6jm60utaylrnnc'],
    ['Clothing & Textiles', 'cmdw978jx0k83mg0uij7zjef3'],
  ],
  'Form 2': [
    ['Mathematics', 'cmekh06gb0c0ekr0u8dflebla'],
    ['Intervention Mathematics', 'cmfocc5ql0hasm40uqjmty9d9'],
    ['General Science', 'cme6graz50dwzm90ukyuuno5x'],
    ['Social Studies', 'cmekhi7l30cbsp20ulf2a5p5w'],
    ['English Language', 'cme6glvhl0gvgm30uccc5uu7j'],
    ['Intervention English Language', 'cmfocc5ql0hasm40uqjmty9d9'],
    ['Elective ICT', 'cmekgp6rq0bjkp20u76nao8s4'],
    ['Economics', 'cme6gikat0cg8m50ubv2or1xz'],
    ['History', 'cmdxjohhq2uwtno0vln690jg1'],
    ['C.R.S.', 'cmesm1nji032sgs0vkcasizmi'],
    ['Accounting', 'cmeojcma2036fgk0u4pscv17f'],
    ['Management-in-Living', 'cme6hcu7o0i1rm30udu4jxxlt'],
    ['Biology', 'cme6fjssk0bbom50u3bk6xwpt'],
    ['Food & Nutrition', 'cme6havtb09ypnl0u463nznvq'],
    ['Clothing & Textiles', 'cme6h94e50apwjd0ucc7wjk10'],
    ['Building & Wood Construction Tech.', 'cme6eri0r09gbk90uguxc6b9e'],
    ['Electricals & Electronics Tech.', 'cme6fv4cg0dcpm90u0p9fk8kr'],
    ['Business Management', 'cmd97ngc20acujq0usfl5z5v1'],
    ['Design & Comm. Tech.', 'cme6gaio409uyjd0uh3we9cz3'],
  ],
  'New SHS Curriculum (All Forms)': [
    ['Additional Mathematics', 'cmluhc0jr0pxxla0uir19mqzs'],
    ['Agricultural Science', 'cmluid6zh0qyamb0usp9ht12n'],
    ['Agriculture', 'cmluigx4y0sl1la0u7epd4jad'],
    ['Automotive & Metal Technology', 'cmluim4n60rhnmb0uidu9v3m4'],
    ['Building Construction & Woodwork Technology', 'cmluijfvv0r9mmb0u9f2sf3rc'],
    ['Arabic', 'cmlv3eqr834r8j20uaotzujhn'],
    ['Art and Design Foundation', 'cmlv3hdam356jj20u03hw660o'],
    ['Aviation and Aerospace Engineering', 'cmlv3syjl3n6nla0uihbswg56'],
    ['Biology', 'cmn7hf07p18bgkb0vje8oovrs'],
    ['Biomedical Science', 'cmmx48tzc08k8ko0w73oqifc0'],
    ['Business Management', 'cmlv3uyj637i6j20u4andmksc'],
    ['Chemistry', 'cmlv3xgvx37yij20u8a0e3w30'],
    ['Christian Religious Studies', 'cmn7hkdmq17sykg0wfleydo5u'],
    ['Clothing and Textiles', 'cmlv3zkcr24ephg0utpggftt9'],
    ['Computing', 'cmlv42qwc3p28la0uvreo92pd'],
    ['Design and Communication Technology', 'cmlv44nih396wj20u3fis2i63'],
    ['Economics', 'cmnbk2cgl10jhko0wn7fea08j'],
    ['Engineering', 'cmlv48fru25y7hg0urgcyyk1g'],
    ['English Language', 'cmlv4aeps3aj7j20u2dxr0slc'],
    ['Food and Nutrition', 'cmlv4ci5e26o5hg0umpfk0ot5'],
    ['French', 'cmlv4eb5i3rb7la0up25elgl0'],
    ['General Science', 'cmlv4gpmx3bepj20us8wnl5q7'],
    ['Geography', 'cmngh2zks1f57fa0w7ol2oled'],
    ['Ghanaian Language', 'cmlv4iua23boxj20uzmdhb3oi'],
    ['Government', 'cmlv4lkdy2843hg0u2w6lvv9m'],
    ['History', 'cmlv4oti428h6hg0uqurrwtob'],
    ['ICT', 'cmnd6o2tk1du1jb0wtdeg3324'],
    ['Islamic Religious Studies', 'cmnbko4nl11agko0wpqkgp41z'],
    ['Literature in English', 'cmlv4r40x3cw3j20u22yh93mz'],
    ['Management in Living', 'cmlv4tgwy3d99j20u6a42dyn8'],
    ['Manufacturing Engineering', 'cmlv4vv1h3tyrla0u5y4co7th'],
    ['Mathematics', 'cmk7omrgz2vhtgn0uv7dg4q0f'],
    ['Music', 'cmlv50e6d3efgj20uxs0oju0z'],
    ['PEH Core', 'cmlv52c9n3v6lla0us4gf9vjc'],
    ['PEH Elective', 'cmnbkbyhb10wyko0w2fz0f3i2'],
    ['Performing Arts', 'cmlv54pkx3f1sj20uchmz8zha'],
    ['Physics', 'cmnbk5pwp10pjko0wpzkicnoo'],
    ['Religious and Moral Education', 'cmlv57hp03w2wla0uhc0eqtz9'],
    ['Robotics', 'cmnbki6pg38agnl0wn7unsoq9'],
    ['Social Studies', 'cmlv58w5x2bgphg0umrutrfdd'],
  ],
};

async function run() {
  const { rows: [{ t }] } = await pool.query(`SELECT to_regclass('public.subject_app_links') AS t`);
  if (!t) throw new Error('subject_app_links does not exist yet. Start the backend once so its migrations run, then re-run this script.');
  let inserted = 0, updated = 0;
  for (const [group, apps] of Object.entries(APPS)) {
    const order = GROUP_ORDER.indexOf(group) + 1;
    for (const [subject, id] of apps) {
      const { rows } = await pool.query(
        `INSERT INTO subject_app_links (school_id, group_label, group_sort_order, subject, url)
         VALUES (NULL, $1, $2, $3, $4)
         ON CONFLICT (COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(group_label), LOWER(subject))
         DO UPDATE SET url = EXCLUDED.url, group_sort_order = EXCLUDED.group_sort_order, updated_at = now()
         RETURNING (xmax = 0) AS is_new`,
        [group, order, subject, P(id)]
      );
      rows[0].is_new ? inserted++ : updated++;
    }
  }
  const total = Object.values(APPS).reduce((n, a) => n + a.length, 0);
  console.log(`Shared subject apps: ${total} in the list, ${inserted} added, ${updated} already there (link and order refreshed).`);
}

run().then(() => pool.end()).catch(err => { console.error(err.message); pool.end(); process.exit(1); });
