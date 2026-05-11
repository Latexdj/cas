import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  token:      'cas_token',
  userId:     'cas_user_id',
  userName:   'cas_user_name',
  userRole:   'cas_user_role',
  schoolId:   'cas_school_id',
  schoolCode: 'cas_school_code',
};

export const storage = {
  async getToken()      { return AsyncStorage.getItem(KEYS.token); },
  async getUserId()     { return AsyncStorage.getItem(KEYS.userId); },
  async getUserName()   { return AsyncStorage.getItem(KEYS.userName); },
  async getUserRole()   { return AsyncStorage.getItem(KEYS.userRole); },
  async getSchoolId()   { return AsyncStorage.getItem(KEYS.schoolId); },
  async getSchoolCode() { return AsyncStorage.getItem(KEYS.schoolCode); },

  async saveSchoolCode(code: string) {
    await AsyncStorage.setItem(KEYS.schoolCode, code.toUpperCase().trim());
  },

  async saveSession(token: string, id: string, name: string, role: string, schoolId: string) {
    await AsyncStorage.multiSet([
      [KEYS.token,    token],
      [KEYS.userId,   id],
      [KEYS.userName, name],
      [KEYS.userRole, role],
      [KEYS.schoolId, schoolId],
    ]);
  },

  async clearSession() {
    await AsyncStorage.multiRemove([
      KEYS.token, KEYS.userId, KEYS.userName, KEYS.userRole, KEYS.schoolId,
    ]);
  },
};
