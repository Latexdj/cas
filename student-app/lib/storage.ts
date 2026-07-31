import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  token:             'cas_s_token',
  userId:            'cas_s_user_id',
  userName:          'cas_s_user_name',
  schoolId:          'cas_s_school_id',
  schoolCode:        'cas_s_school_code',
  primaryColor:      'cas_s_primary_color',
  accentColor:       'cas_s_accent_color',
  schoolLogo:        'cas_s_school_logo',
  darkMode:          'cas_s_dark_mode',
  mustChangePwd:     'cas_s_must_change_pwd',
};

export const storage = {
  async getToken()          { return AsyncStorage.getItem(K.token); },
  async getUserId()         { return AsyncStorage.getItem(K.userId); },
  async getUserName()       { return AsyncStorage.getItem(K.userName); },
  async getSchoolId()       { return AsyncStorage.getItem(K.schoolId); },
  async getSchoolCode()     { return AsyncStorage.getItem(K.schoolCode); },
  async getPrimaryColor()   { return AsyncStorage.getItem(K.primaryColor); },
  async getAccentColor()    { return AsyncStorage.getItem(K.accentColor); },
  async getSchoolLogo()     { return AsyncStorage.getItem(K.schoolLogo); },
  async getDarkMode()       { return AsyncStorage.getItem(K.darkMode); },
  async getMustChangePwd()  { return AsyncStorage.getItem(K.mustChangePwd); },

  async saveSchoolCode(code: string) {
    await AsyncStorage.setItem(K.schoolCode, code.toUpperCase().trim());
  },

  async saveTheme(primary: string, accent: string, logo?: string | null) {
    await AsyncStorage.multiSet([[K.primaryColor, primary], [K.accentColor, accent]]);
    if (logo !== undefined) {
      if (logo) await AsyncStorage.setItem(K.schoolLogo, logo);
      else await AsyncStorage.removeItem(K.schoolLogo);
    }
  },

  async saveSession(token: string, id: string, name: string, schoolId: string, mustChange: boolean) {
    await AsyncStorage.multiSet([
      [K.token,         token],
      [K.userId,        id],
      [K.userName,      name],
      [K.schoolId,      schoolId],
      [K.mustChangePwd, mustChange ? '1' : '0'],
    ]);
  },

  async setMustChangePwd(v: boolean) {
    await AsyncStorage.setItem(K.mustChangePwd, v ? '1' : '0');
  },

  async saveDarkMode(isDark: boolean) {
    await AsyncStorage.setItem(K.darkMode, isDark ? '1' : '0');
  },

  async clearSession() {
    await AsyncStorage.multiRemove([K.token, K.userId, K.userName, K.schoolId, K.mustChangePwd]);
  },
};
