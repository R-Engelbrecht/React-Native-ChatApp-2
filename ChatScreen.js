import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import axios from 'axios';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, TouchableWithoutFeedback,Keyboard } from 'react-native';
import { ngrok } from './apiConfig';
import { getLatestMessageForUser, getUsers, removeEmptyUsers, upsertChatUser } from './sqlite';
import {Button,Card} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

export default function ChatScreen({ userData }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const navigation = useNavigation();
  const isFocused = useIsFocused(); // Track screen focus
  const scrollRef = useRef(null);
  const POLLING_INTERVAL = 5000; // 5 seconds
  const lastFetchedTimestampRef = useRef(new Date('2025-08-01T00:00:00.000Z').toISOString());
  const inputRef = useRef(null);

  // Format timestamps like "YYYY-MM-DD HH:MM"
  const formatTs = (ts) => {
    if (!ts) return '';
    const clean = String(ts).replace('T', ' ').replace('Z', '');
    return clean.slice(0, 16);
  };

  const dismissAndClear = () => {
  inputRef.current?.blur();   
  Keyboard.dismiss();
  setSearch('');
  setResults([]);             
};

  // Hydrate users with latest message + time
  const hydrateUsersWithLatest = useCallback(async (users) => {
    console.log('hydrateUsersWithLatest: Starting hydration');
    if (!userData?.userID) {
      console.log('hydrateUsersWithLatest: No userID, returning users as-is');
      return users;
    }
    const myId = Number(userData.userID);
    const out = [];

    for (const u of users) {
      try {
        const userIdToQuery = Number(u.userID || u.UserID);
        console.log('hydrateUsersWithLatest: Fetching latest message for userID:', userIdToQuery);
        const latest = await getLatestMessageForUser(myId, userIdToQuery);
        console.log('hydrateUsersWithLatest: Latest message result:', latest);
        out.push({
          ...u,
          userID: userIdToQuery,
          LatestMessage: latest?.message || 'No messages yet',
          LatestTimestamp: latest?.timestamp ? formatTs(latest.timestamp) : '',
        });
      } catch (e) {
        console.error('hydrateUsersWithLatest: Error for user', u.userID || u.UserID, e);
        out.push({
          ...u,
          userID: Number(u.userID || u.UserID),
          LatestMessage: 'No messages yet',
          LatestTimestamp: '',
        });
      }
    }
    console.log('hydrateUsersWithLatest: Hydrated users:', out);
    return out;
  }, [userData]);

  // Load chat users from SQLite
  const loadChatUsers = useCallback(async () => {
    console.log('loadChatUsers: Starting');
    try {
      await removeEmptyUsers();
      console.log('loadChatUsers: Removed empty users');
      const users = await getUsers();
      console.log('loadChatUsers: Loaded users from DB:', users);
      const hydrated = await hydrateUsersWithLatest(users);
      console.log('loadChatUsers: Setting selectedUsers:', hydrated);
      setSelectedUsers(hydrated);
    } catch (error) {
      console.error('loadChatUsers: Failed to load chat users:', error);
    }
    console.log('loadChatUsers: Complete');
  }, [hydrateUsersWithLatest]);

  // Poll for new messages
  const pollForNewMessages = useCallback(async () => {
    console.log('pollForNewMessages: Starting poll at', new Date().toISOString());
    if (!userData?.userID) {
      console.log('pollForNewMessages: No userID, redirecting to Login');
      Alert.alert('Error', 'Please log in to continue.', [
        {
          text: 'OK',
          onPress: async () => {
            await AsyncStorage.removeItem(`token_${userData?.userID}`);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          },
        },
      ]);
      return;
    }

    try {
    const token = await AsyncStorage.getItem(`token_${userData?.userID}`);
console.log('pollForNewMessages: Retrieved token for user', userData?.userID, ':', token);

if (!token) {
  console.log('pollForNewMessages: No token found for user', userData?.userID);
  Alert.alert('Error', 'Session expired. Please log in again.', [
    {
      text: 'OK',
      onPress: async () => {
        await AsyncStorage.removeItem(`token_${userData?.userID}`); // clear only this user’s token
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      },
    },
  ]);
  return;
}

      console.log('pollForNewMessages: Sending request to /messages/new with userId:', userData.userID, 'timestamp:', lastFetchedTimestampRef.current);
      const response = await axios.post(
        `${ngrok}/messages/new`,
        {
          lastTimestamp: lastFetchedTimestampRef.current,
          userId: Number(userData.userID),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('pollForNewMessages: Response:', response.data);

      const newMessages = response.data;
      if (newMessages.length === 0) {
        console.log('pollForNewMessages: No new messages');
        return;
      }

      // Update last fetched timestamp
      const latestTimestamp = newMessages.reduce((max, msg) => {
        const msgTime = new Date(msg.Timestamp);
        return msgTime > new Date(max) ? msgTime.toISOString() : max;
      }, lastFetchedTimestampRef.current);
      lastFetchedTimestampRef.current = latestTimestamp;
      console.log('pollForNewMessages: Updated lastFetchedTimestamp:', lastFetchedTimestampRef.current);

      // Identify new senders not in selectedUsers
      const newSenders = newMessages
        .filter(msg => !selectedUsers.some(u => u.userID === Number(msg.sender_id)))
        .map(msg => ({
          userID: Number(msg.sender_id),
          name: msg.name || 'Unknown',
          email: msg.email || '',
        }))
        .reduce((unique, sender) => {
          if (!unique.some(u => u.userID === sender.userID)) {
            unique.push(sender);
          }
          return unique;
        }, []);
      console.log('pollForNewMessages: New senders:', newSenders);

      if (newSenders.length > 0) {
        console.log('pollForNewMessages: Upserting new senders');
        for (const sender of newSenders) {
          await upsertChatUser(sender.userID, sender.name, sender.email);
          console.log('pollForNewMessages: Upserted sender:', sender);
        }
        console.log('pollForNewMessages: Reloading users');
        await loadChatUsers();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (error) {
      //console.error('pollForNewMessages: Error:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        console.log('pollForNewMessages: Unauthorized, redirecting to Login');
        Alert.alert('Error', 'Session expired. Please log in again.', [
          {
            text: 'OK',
            onPress: async () => {
              await AsyncStorage.removeItem(`token_${userData?.userID}`);
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            },
          },
        ]);
      }
    }
    console.log('pollForNewMessages: Poll complete');
  }, [userData, selectedUsers, loadChatUsers]);

  // Start polling only when screen is focused
  useEffect(() => {
    let isPolling = false;
    let intervalId;

    if (isFocused) {
      console.log('useEffect: Starting polling');
      intervalId = setInterval(async () => {
        if (isPolling) {
          console.log('useEffect: Poll skipped, previous poll still running');
          return;
        }
        isPolling = true;
        console.log('useEffect: Triggering poll at', new Date().toISOString());
        await pollForNewMessages();
        isPolling = false;
      }, POLLING_INTERVAL);

      // Initial poll
      pollForNewMessages();
    }

    // Cleanup on unmount or when screen loses focus
    return () => {
      console.log('useEffect: Clearing interval on unmount or focus change');
      clearInterval(intervalId);
    };
  }, [isFocused, pollForNewMessages]);

  // Load initial users
  useEffect(() => {
    console.log('useEffect: Initial load of chat users');
    loadChatUsers();
  }, [loadChatUsers]);

  // Search users
  useEffect(() => {
    if (search.length === 0) {
      setResults([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      console.log('useEffect: Triggering search for query:', search);
      searchUsers(search);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  async function searchUsers(query) {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem(`token_${userData?.userID}`);
      console.log('searchUsers: Retrieved token:', token);
      if (!token) throw new Error('No token found');

      console.log('searchUsers: Searching for query:', query);
      const response = await axios.get(
        `${ngrok}/search?query=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('searchUsers: Search results:', response.data);
      setResults(response.data);
    } catch (error) {
      console.error('searchUsers: Error:', error.response?.data || error.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUserSelect(user) {
    dismissAndClear();
    console.log('handleUserSelect: Triggered with user:', user);
    const normalizedUser = {
      userID: Number(user.UserID || user.id),
      name: user.name || user.Name || 'Unknown',
      email: user.Email || user.email || '',
    };

    try {
      console.log('handleUserSelect: Upserting user:', normalizedUser);
      await upsertChatUser(normalizedUser.userID, normalizedUser.name, normalizedUser.email);
      console.log('handleUserSelect: Upsert completed for userID:', normalizedUser.userID);
    } catch (err) {
      console.error('handleUserSelect: Error saving user to local DB:', err);
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
      console.error('handleUserSelect: No authenticated user found:', userData);
      Alert.alert('Error', 'Please register to continue.', [
        {
          text: 'OK',
          onPress: async () => {
            await AsyncStorage.removeItem(`token_${userData?.userID}`);
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          },
        },
      ]);
      return;
    }

    console.log('handleUserSelect: Navigating to Messages with:', {
      userID: userData.userID,
      chatPartnerID: normalizedUser.userID,
      name: normalizedUser.name,
    });
    navigation.navigate('Messages', {
      userID: Number(userData.userID),
      chatPartnerID: Number(normalizedUser.userID),
      name: normalizedUser.name,
      userData,
    });
  }

  const renderItem = ({ item }) => (
    <Card
    style={styles.item}
    onPress={() => {
      dismissAndClear();
      handleUserSelect(item);
    }}
  >
    <Text style={styles.name}>{item.name}</Text>
    <Text style={styles.email}>{item.email || item.Email}</Text>
  </Card>
);

  return (

   
              
            
<TouchableWithoutFeedback onPress={dismissAndClear} accesible = {false}>
     <LinearGradient
             colors={['#3b4d53ff', '#031b19bd']}
             style={styles.background}
           >

             
    <View style={styles.container}>
      <TextInput
       ref={inputRef}
        placeholder="Search users by name or email"
        value={search}
        onChangeText={setSearch}
        style={styles.input}
      />
     

      {loading && <Text style={{ padding: 10, color: 'white' }}>Loading...</Text>}

      {search.length > 0 && results.length > 0 && (
        <View style={{ height: results.length * 62,backgroundColor: 'rgba(12, 12, 12, 0)' }}>
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.UserID || item.id)}
            renderItem={renderItem}
            ListEmptyComponent={!loading && <Text style={{ padding: 10 }}>No users found</Text>}
            style={styles.searchList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={dismissAndClear}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.userList}
        contentContainerStyle={styles.userListContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {selectedUsers.length === 0 && (
          <Text style={{ padding: 10, color: 'black' }}>No chats available</Text>
        )}
        {selectedUsers.map((user, index) => (
          <TouchableOpacity
            key={user.userID ?? `user-${index}`}
            style={styles.userItem}
            onPress={() => {
              if (!userData || !userData.userID) {
                console.error('ScrollView: No authenticated user found:', userData);
                Alert.alert('Error', 'Please register to continue.', [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await AsyncStorage.removeItem(`token_${userData?.userID}`);
                      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    },
                  },
                ]);
                return;
              }
              console.log('ScrollView: Navigating to Messages for user:', user.userID);
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
    
    </LinearGradient>
    </TouchableWithoutFeedback>
   
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#00000000'
  },

  container: { flex: 1,
     padding: 10,
     backgroundColor: '#29292905',
     paddingTop: 50,
    },
  input: {
    height: 40,
    borderColor: '#00000042',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 10,
    //paddingTop: 20,
    marginBottom: 10,
    backgroundColor: '#fdfdfdff',
    color: '#041e29ff',
  },
  item: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#d1c9c9',
    backgroundColor: '#284f5f10',

    minHeight: 60,
  },
  name: { fontWeight: 'bold',color: '#f5f3f3ff' },
  email: { color: '#f5f3f3ff' },
  
  userList: {
     maxHeight: 700,
      marginVertical: 10,
      backgroundColor: 'rgba(0, 0, 0, 0)' 
    },
  userListContent: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    gap: 10,
    backgroundColor: 'rgba(0, 0, 0, 0)',
  },
  userItem: {
    backgroundColor: '#071c24a8',
    //padding: 20,
    paddingTop:20,
    paddingBottom:20,
    paddingLeft:15,
    paddingRight:15,
    justifyContent: 'flex-start',
    borderRadius: 24,
    marginHorizontal: 1,
    minHeight: 90,
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
  searchList: {
    maxHeight: 300,
    borderColor: '#00000091',
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#ffffff09',
    marginBottom: 10,
  },
});

