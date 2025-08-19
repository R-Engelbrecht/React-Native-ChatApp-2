import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { upsertChatUser, getUsers, removeEmptyUsers, getLatestMessageForUser } from './sqlite';
import { ngrok } from './apiConfig'; // Ensure this is correctly set in apiConfig.js

export default function ChatScreen({ userData }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const navigation = useNavigation();
  const scrollRef = React.useRef(null);
  

  // Format timestamps like "YYYY-MM-DD HH:MM"
  const formatTs = (ts) => {
    if (!ts) return '';
    const clean = String(ts).replace('T', ' ').replace('Z', '');
    return clean.slice(0, 16);
  };

  // Fill latest message + time for each user from SQLite
  const hydrateUsersWithLatest = async (users) => {
    if (!userData?.userID) return users;
    const myId = Number(userData.userID);
    const out = [];

    for (const u of users) {
      try {
        const latest = await getLatestMessageForUser(myId, Number(u.userID));
        out.push({
          ...u,
          LatestMessage: latest?.message || 'No messages yet',
          LatestTimestamp: latest?.timestamp ? formatTs(latest.timestamp) : '',
        });
      } catch (e) {
        console.log('hydrateUsersWithLatest error for user', u.userID, e);
        out.push({
          ...u,
          LatestMessage: u.LatestMessage || 'No messages yet',
          LatestTimestamp: u.LatestTimestamp || '',
        });
      }
    }
    return out;
  };

  async function loadChatUsers() {
    try {
      await removeEmptyUsers();
      const users = await getUsers();
      console.log('Loaded users from DB:', JSON.stringify(users, null, 2));
      const hydrated = await hydrateUsersWithLatest(users);
      setSelectedUsers(hydrated);
    } catch (error) {
      console.error('Failed to load chat users:', error);
    }
  }

  useEffect(() => {
    loadChatUsers();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadPastChats();
    }, [])
  );

  async function loadPastChats() {
    try {
      const users = await getUsers();
      console.log('Loaded users from DB:', JSON.stringify(users, null, 2));
      const hydrated = await hydrateUsersWithLatest(users);
      setSelectedUsers(hydrated);
    } catch (error) {
      console.error('Error loading past chats:', error);
    }
  }

  useEffect(() => {
    if (search.length === 0) {
      setResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      searchUsers(search);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  async function searchUsers(query) {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('remember_token');
      if (!token) throw new Error('No token found');

      const response = await axios.get(
        `${ngrok}/search?query=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Search results:', JSON.stringify(response.data, null, 2));
      setResults(response.data);
    } catch (error) {
      console.error('Search error:', error.response?.data || error.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUserSelect(user) {
    console.log('handleUserSelect triggered with user:', JSON.stringify(user, null, 2));

    const normalizedUser = {
      userID: Number(user.UserID || user.id),
      name: user.name || user.Name || 'Unknown',
      email: user.Email || user.email || '',
    };

    try {
      console.log('Upserting user:', normalizedUser);
      await upsertChatUser(normalizedUser.userID, normalizedUser.name, normalizedUser.email);
      console.log('Upsert completed for userID:', normalizedUser.userID);
    } catch (err) {
      console.error('Error saving user to local DB:', err);
    }

    const exists = selectedUsers.find(u => u.userID === normalizedUser.userID);
    if (!exists) {
      setSelectedUsers(prev => [...prev, normalizedUser]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      const index = selectedUsers.findIndex(u => u.userID === normalizedUser.userID);
      scrollRef.current?.scrollTo({ x: index * 100, animated: true });
      setSearch('');
    }

    if (!userData || !userData.userID) {
      console.error('No authenticated user found:', userData);
      Alert.alert('Error', 'Please register to continue.', [
        {
          text: 'OK',
          onPress: async () => {
            await AsyncStorage.removeItem('remember_token');
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          },
        },
      ]);
      return;
    }

    console.log('Navigating to Messages with:', {
      userID: userData.userID,
      chatPartnerID: normalizedUser.userID,
      name: normalizedUser.name,
      userData,
    });

    navigation.navigate('Messages', {
      userID: Number(userData.userID),
      chatPartnerID: Number(normalizedUser.userID),
      name: normalizedUser.name,
      userData,
    });
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => handleUserSelect(item)}
    >
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.email}>{item.email || item.Email}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Search users by name or email"
        value={search}
        onChangeText={setSearch}
        style={styles.input}
      />

      {loading && <Text style={{ padding: 10, color: 'white' }}>Loading...</Text>}

      {search.length > 0 && results.length > 0 && (
        <View style={{ height: results.length * 62 }}>
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.UserID || item.id)}
            renderItem={renderItem}
            ListEmptyComponent={!loading && <Text style={{ padding: 10 }}>No users found</Text>}
            style={styles.searchList}
          />
        </View>
      )}

      <ScrollView
        style={styles.userList}
        contentContainerStyle={styles.userListContent}
        showsVerticalScrollIndicator={true}
      >
        {selectedUsers.length === 0 && (
          <Text style={{ padding: 10, color: 'white' }}>No chats available</Text>
        )}
        {selectedUsers.map((user, index) => (
          <TouchableOpacity
            key={user.userID ?? `user-${index}`}
            style={styles.userItem}
            onPress={() => {
              if (!userData || !userData.userID) {
                Alert.alert('Error', 'Please register to continue.', [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await AsyncStorage.removeItem('remember_token');
                      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    },
                  },
                ]);
                return;
              }
              navigation.navigate('Messages', {
                userID: Number(userData.userID),
                chatPartnerID: Number(user.userID),
                name: user.name,
                userData,
              });
            }}
          >
            <View style={styles.chatTextContainer}>
              <Text style={styles.chatName}>{user.name}</Text>
              <Text style={styles.chatMessages}>{user.LatestMessage || 'No messages yet'}</Text>
              {!!user.LatestTimestamp && (
                <Text style={styles.chatTime}>{user.LatestTimestamp}</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10, backgroundColor: '#000000e3' },
  input: {
    height: 40,
    borderColor: '#999',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#ddeaecff',
  },
  item: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    minHeight: 60,
  },
  name: { fontWeight: 'bold' },
  email: { color: '#666' },
  userList: { maxHeight: 700, marginVertical: 10 },
  userListContent: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    gap: 10,
  },
  userItem: {
    backgroundColor: '#30343dff',
    padding: 20,
    justifyContent: 'flex-start',
    borderRadius: 12,
    marginHorizontal: 5,
    minHeight: 70,
  },
  chatTextContainer: { flexDirection: 'column' },
  chatName: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 2,
    color: '#ffffffff',
  },
  chatMessages: {
    fontSize: 13,
    color: '#bebebeff',
    marginTop: 1,
  },
  chatTime: {
    fontSize: 11,
    color: '#d4d4d4ff',
    marginTop: 2,
    alignSelf: 'flex-end',
  },
});
