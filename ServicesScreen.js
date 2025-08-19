import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList,Button, Alert } from 'react-native';
import { getAllMessages,resetDatabase,loadMessages } from './sqlite'; // you'll need this helper
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ServicesScreen() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    async function loadMessages() {
      try {
        const dbMessages = await getAllMessages(); // fetch every row in Messages
        console.log('All messages:', dbMessages);
        setMessages(dbMessages);
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }
    loadMessages();
  }, []);

  const handleReset = async () => {
    Alert.alert(
      "Reset Data",
      "Are you sure you want to delete all messages and reset app data?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, reset", 
          style: "destructive",
          onPress: async () => {
            try {
              await resetDatabase();         // clear SQLite
              await AsyncStorage.clear();    // optional: clear tokens
              await loadMessages();          // refresh UI
              console.log('App data reset');
            } catch (e) {
              console.error('Error resetting data:', e);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.messageItem}>
      <Text style={styles.meta}>
        ID: {item.id} | Sender: {item.senderID} → Receiver: {item.receiverID}
      </Text>
      <Text style={styles.messageText}>{item.message}</Text>
      <Text style={styles.timestamp}>{item.timestamp}</Text>
    </View>
  );

   return (
    <View style={styles.container}>
      <Button title="Reset All Messages" onPress={handleReset} color="#d9534f" />
      <Text style={styles.header}>All Messages in SQLite</Text>
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>No messages found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  messageItem: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    elevation: 1,
  },
  meta: { fontSize: 12, color: '#888', marginBottom: 4 },
  messageText: { fontSize: 14 },
  timestamp: { fontSize: 11, color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', color: '#666', marginTop: 20 },
});
