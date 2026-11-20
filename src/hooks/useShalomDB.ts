// Reactive state hook for SHALOM Personal App
import { useState, useEffect, useCallback } from 'react';
import { dbService, STORES } from '../services/db';
import {
  UserProfile,
  PrayerItem,
  TestimonyItem,
  PrayerGroup,
  Contact,
  CalendarActivity,
  RecordedParole,
  MessageTemplate,
  ShareHistoryItem,
  WeeklyAltarDay,
  LifeChangeGoal,
  IntercessionPerson,
  SpiritualCommitment,
  SpiritualHabitLog,
  PersonalProgram,
  VaultDocument,
  BibleStudySession,
  CreativeDesignItem,
  StudioProjectRecord,
  DownloadedStudioAsset,
} from '../types';

export function useShalomDB() {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [prayers, setPrayers] = useState<PrayerItem[]>([]);
  const [testimonies, setTestimonies] = useState<TestimonyItem[]>([]);
  const [prayerGroups, setPrayerGroups] = useState<PrayerGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calendarActivities, setCalendarActivities] = useState<CalendarActivity[]>([]);
  const [recordings, setRecordings] = useState<RecordedParole[]>([]);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [shareHistory, setShareHistory] = useState<ShareHistoryItem[]>([]);
  const [weeklyAltarDays, setWeeklyAltarDays] = useState<WeeklyAltarDay[]>([]);
  const [lifeGoals, setLifeGoals] = useState<LifeChangeGoal[]>([]);
  const [intercessionPeople, setIntercessionPeople] = useState<IntercessionPerson[]>([]);
  const [commitments, setCommitments] = useState<SpiritualCommitment[]>([]);
  const [habitLogs, setHabitLogs] = useState<SpiritualHabitLog[]>([]);
  const [personalPrograms, setPersonalPrograms] = useState<PersonalProgram[]>([]);
  const [vaultDocuments, setVaultDocuments] = useState<VaultDocument[]>([]);
  const [bibleStudies, setBibleStudies] = useState<BibleStudySession[]>([]);
  const [creations, setCreations] = useState<CreativeDesignItem[]>([]);
  const [studioProjects, setStudioProjects] = useState<StudioProjectRecord[]>([]);
  const [downloadedAssets, setDownloadedAssets] = useState<DownloadedStudioAsset[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [
        profiles,
        pList,
        tList,
        pgList,
        cList,
        calList,
        rList,
        mtList,
        shList,
        waList,
        lgList,
        ipList,
        cmList,
        hlList,
        ppList,
        vdList,
        bsList,
        crList,
        spList,
        daList,
      ] = await Promise.all([
        dbService.getAll<UserProfile>(STORES.PROFILES),
        dbService.getAll<PrayerItem>(STORES.PRAYERS),
        dbService.getAll<TestimonyItem>(STORES.TESTIMONIES),
        dbService.getAll<PrayerGroup>(STORES.PRAYER_GROUPS),
        dbService.getAll<Contact>(STORES.CONTACTS),
        dbService.getAll<CalendarActivity>(STORES.CALENDAR_ACTIVITIES),
        dbService.getAll<RecordedParole>(STORES.RECORDINGS),
        dbService.getAll<MessageTemplate>(STORES.MESSAGE_TEMPLATES),
        dbService.getAll<ShareHistoryItem>(STORES.SHARE_HISTORY),
        dbService.getAll<WeeklyAltarDay>(STORES.WEEKLY_ALTAR),
        dbService.getAll<LifeChangeGoal>(STORES.LIFE_GOALS),
        dbService.getAll<IntercessionPerson>(STORES.INTERCESSION_PEOPLE),
        dbService.getAll<SpiritualCommitment>(STORES.COMMITMENTS),
        dbService.getAll<SpiritualHabitLog>(STORES.HABIT_LOGS),
        dbService.getAll<PersonalProgram>(STORES.PERSONAL_PROGRAMS),
        dbService.getAll<VaultDocument>(STORES.VAULT_DOCUMENTS),
        dbService.getAll<BibleStudySession>(STORES.BIBLE_STUDIES),
        dbService.getAll<CreativeDesignItem>(STORES.CREATIONS),
        dbService.getAll<StudioProjectRecord>(STORES.STUDIO_PROJECTS),
        dbService.getAll<DownloadedStudioAsset>(STORES.DOWNLOADED_ASSETS),
      ]);

      setUserProfile(profiles[0] || null);
      setPrayers(pList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setTestimonies(tList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setPrayerGroups(pgList);
      setContacts(cList.sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setCalendarActivities(calList.sort((a, b) => a.date.localeCompare(b.date)));
      setRecordings(rList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setMessageTemplates(mtList);
      setShareHistory(shList.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setWeeklyAltarDays(waList);
      setLifeGoals(lgList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setIntercessionPeople(ipList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setCommitments(cmList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setHabitLogs(hlList.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
      setPersonalPrograms(ppList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setVaultDocuments(vdList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setBibleStudies(bsList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setCreations(crList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setStudioProjects(spList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setDownloadedAssets(daList.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error('Erreur chargement données SHALOM:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadData = useCallback(async () => {
    await fetchData();
    window.dispatchEvent(new Event('shalom-db-updated'));
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const handleSync = () => {
      fetchData();
    };
    window.addEventListener('shalom-db-updated', handleSync);
    return () => window.removeEventListener('shalom-db-updated', handleSync);
  }, [fetchData]);

  return {
    loading,
    userProfile,
    prayers,
    testimonies,
    prayerGroups,
    contacts,
    calendarActivities,
    recordings,
    messageTemplates,
    shareHistory,
    weeklyAltarDays,
    lifeGoals,
    intercessionPeople,
    commitments,
    habitLogs,
    personalPrograms,
    vaultDocuments,
    bibleStudies,
    creations,
    studioProjects,
    downloadedAssets,
    reloadData,
  };
}
