import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Body, Button, Card, Loading, Notice, Picker, Row, Screen, Title } from '@/components/ui/kit';

interface SubjectApp { id: string; group_label: string; subject: string; url: string }
interface Site { id: string; title: string; description: string | null; url: string; category: string; subjects: string[] }

const CATEGORIES = [
  { key: 'curriculum', label: 'Curriculum & syllabus' },
  { key: 'lesson_planning', label: 'Lesson planning' },
  { key: 'videos', label: 'Videos' },
  { key: 'past_questions', label: 'Past questions & exams' },
  { key: 'professional_development', label: 'Professional development' },
  { key: 'tools', label: 'Tools' },
];
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const K_APPS = 'cas_t_subject_apps', K_SITES = 'cas_t_websites';
async function readJson<T>(k: string, d: T): Promise<T> { try { return JSON.parse((await AsyncStorage.getItem(k)) || 'null') ?? d; } catch { return d; } }

export default function ResourcesScreen() {
  const C = useTheme();
  const [apps, setApps] = useState<SubjectApp[] | null>(null);
  const [appsErr, setAppsErr] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [recentApps, setRecentApps] = useState<string[]>([]);

  const [sites, setSites] = useState<Site[] | null>(null);
  const [sitesErr, setSitesErr] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [recentSites, setRecentSites] = useState<string[]>([]);

  useEffect(() => {
    api.get<SubjectApp[]>('/api/teacher-resources/subject-apps').then(async r => {
      setApps(r.data);
      const saved = await readJson<{ group?: string; appId?: string; recent?: string[] }>(K_APPS, {});
      const ids = new Set(r.data.map(a => a.id));
      setRecentApps((saved.recent ?? []).filter(id => ids.has(id)));
      const last = r.data.find(a => a.id === saved.appId);
      if (last) { setGroup(last.group_label); setAppId(last.id); }
      else if (saved.group && r.data.some(a => a.group_label === saved.group)) setGroup(saved.group);
    }).catch(() => { setApps([]); setAppsErr('Could not load the subject apps. Check your connection and try again.'); });
    api.get<Site[]>('/api/teacher-resources/websites').then(async r => {
      setSites(r.data);
      const ids = new Set(r.data.map(s => s.id));
      setRecentSites((await readJson<string[]>(K_SITES, [])).filter(id => ids.has(id)));
    }).catch(() => { setSites([]); setSitesErr('Could not load the websites. Check your connection and try again.'); });
  }, []);

  const groups = useMemo(() => [...new Set((apps ?? []).map(a => a.group_label))], [apps]);
  const subjectsInGroup = useMemo(() => (apps ?? []).filter(a => a.group_label === group).sort((a, b) => a.subject.localeCompare(b.subject)), [apps, group]);
  const chosen = (apps ?? []).find(a => a.id === appId && a.group_label === group);

  function launchApp(a: SubjectApp) {
    const next = [a.id, ...recentApps.filter(id => id !== a.id)].slice(0, 3);
    setRecentApps(next);
    AsyncStorage.setItem(K_APPS, JSON.stringify({ group: a.group_label, appId: a.id, recent: next })).catch(() => {});
    api.post(`/api/teacher-resources/subject-apps/${a.id}/launch`).catch(() => {});
    Linking.openURL(a.url);
  }
  function openSite(s: Site) {
    const next = [s.id, ...recentSites.filter(id => id !== s.id)].slice(0, 3);
    setRecentSites(next);
    AsyncStorage.setItem(K_SITES, JSON.stringify(next)).catch(() => {});
    api.post(`/api/teacher-resources/websites/${s.id}/launch`).catch(() => {});
    Linking.openURL(s.url);
  }

  const usedCats = CATEGORIES.filter(c => (sites ?? []).some(s => s.category === c.key));
  const siteSubjects = useMemo(() => [...new Set((sites ?? []).flatMap(s => s.subjects))].sort((a, b) => a.localeCompare(b)), [sites]);
  const shownSites = (sites ?? []).filter(s => {
    const q = search.trim().toLowerCase();
    return (!category || s.category === category) && (!subject || s.subjects.length === 0 || s.subjects.includes(subject))
      && (!q || s.title.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || domain(s.url).includes(q));
  });

  const pill = (label: string, onPress: () => void, sub?: string) => (
    <Pressable key={label + (sub ?? '')} onPress={onPress} accessibilityRole="link"
      style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.primaryText, backgroundColor: C.primaryLight, justifyContent: 'center' }}>
      <Text style={{ color: C.primaryText, fontSize: 14, fontWeight: '700' }}>{label}{sub ? <Text style={{ fontWeight: '400' }}>{`, ${sub}`}</Text> : null}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <Card>
        <Title sub="AI teaching assistants for each subject, built on Playlab. Pick your form and subject; the app opens in your browser.">Subject apps</Title>
        {apps === null ? <Loading /> : appsErr ? <Notice tone="bad" text={appsErr} /> : apps.length === 0 ? <Body soft>No subject apps have been added yet.</Body> : (
          <>
            {recentApps.length > 0 && (
              <View style={{ gap: 6 }}>
                <Body small soft>Recent</Body>
                <Row>{recentApps.map(id => apps.find(a => a.id === id)).filter((a): a is SubjectApp => !!a).map(a => pill(a.subject, () => launchApp(a), a.group_label))}</Row>
              </View>
            )}
            <Picker label="Form or curriculum" value={group} options={groups.map(g => ({ key: g, label: g }))}
              onChange={g => { setGroup(g); setAppId(null); AsyncStorage.setItem(K_APPS, JSON.stringify({ group: g, recent: recentApps })).catch(() => {}); }} />
            <Picker label="Subject" value={chosen ? appId : null} placeholder={group ? 'Choose a subject' : 'Choose a form first'}
              options={subjectsInGroup.map(a => ({ key: a.id, label: a.subject }))} onChange={setAppId} searchable />
            <Button label="Launch app" icon="open-outline" disabled={!chosen} onPress={() => chosen && launchApp(chosen)} />
          </>
        )}
      </Card>

      <Card>
        <Title sub="Trusted sites for the curriculum, lesson planning, videos and more. They open in your browser.">Websites and tools</Title>
        {sites === null ? <Loading /> : sitesErr ? <Notice tone="bad" text={sitesErr} /> : sites.length === 0 ? <Body soft>No websites have been added yet.</Body> : (
          <>
            {recentSites.length > 0 && (
              <View style={{ gap: 6 }}>
                <Body small soft>Recent</Body>
                <Row>{recentSites.map(id => sites.find(s => s.id === id)).filter((s): s is Site => !!s).map(s => pill(s.title, () => openSite(s)))}</Row>
              </View>
            )}
            <TextInput value={search} onChangeText={setSearch} placeholder="Search websites" placeholderTextColor={C.placeholder} accessibilityLabel="Search websites"
              style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
            {usedCats.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
                {[{ key: '', label: 'All' }, ...usedCats].map(c => {
                  const on = category === c.key;
                  return (
                    <Pressable key={c.key || 'all'} onPress={() => setCategory(on && c.key ? '' : c.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryText : C.surface, justifyContent: 'center' }}>
                      <Text style={{ color: on ? C.surface : C.textSoft, fontSize: 14, fontWeight: '600' }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {siteSubjects.length > 0 && (
              <Picker label="Subject" value={subject} placeholder="All subjects"
                options={[{ key: '', label: 'All subjects' }, ...siteSubjects.map(s => ({ key: s, label: s }))]} onChange={v => setSubject(v || null)} />
            )}
            {shownSites.length === 0 ? <Body soft>No website matches. Try another word, category or subject.</Body> : (
              CATEGORIES.filter(c => shownSites.some(s => s.category === c.key)).map(c => (
                <View key={c.key} style={{ gap: 8 }}>
                  {!category && <Text style={{ color: C.textSoft, fontSize: 14, fontWeight: '700' }}>{c.label}</Text>}
                  {shownSites.filter(s => s.category === c.key).map(s => (
                    <Pressable key={s.id} onPress={() => openSite(s)} accessibilityRole="link" accessibilityLabel={`${s.title}, opens in your browser`}
                      style={({ pressed }) => ({ flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, backgroundColor: pressed ? C.bg : C.surface })}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{s.title}</Text>
                        {!!s.description && <Text style={{ color: C.textSoft, fontSize: 14 }}>{s.description}</Text>}
                        <Text style={{ color: C.muted, fontSize: 13 }}>{domain(s.url)}{s.subjects.length ? `, ${s.subjects.join(', ')}` : ''}</Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={C.primaryText} />
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </Card>
    </Screen>
  );
}
