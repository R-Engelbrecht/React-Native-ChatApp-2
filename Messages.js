import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import {Button,Card} from 'react-native-paper';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ngrok } from './apiConfig';
import { getMessagesByUser, insertMessages, updateLatestMessage, upsertChatUser,checkMessageExists } from './sqlite';
import { Keyframe } from 'react-native-reanimated';



export default function Messages({ userData }) {
  const route = useRoute();
  const { chatPartnerID, name } = route.params;
  const userID = userData?.userID;

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatlistRef = useRef(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [lastMessageId, setLastMessageId] = useState(0);

  const insets = useSafeAreaInsets();
  const INPUT_HEIGHT = 60;
  const lastIdRef = useRef(0);
  const [ready, setReady] = useState(false);

  const formatDate = (isoString) => {
    const d = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toDateString();
  };
  

  const loadMessages = async () => {
    if (!userID || !chatPartnerID) {
      console.error('Invalid userID or chatPartnerID:', { userID, chatPartnerID });
      return;
    }
    try {
      await upsertChatUser(Number(userID), userData.name || 'Current User', userData.email || 'user@example.com', '', new Date().toISOString(), 'sent');
      await upsertChatUser(Number(chatPartnerID), name || 'Chat Partner', 'partner@example.com', '', new Date().toISOString(), 'sent');

      const dbMessages = await getMessagesByUser(userID, chatPartnerID);
      console.log('dbMessages:', dbMessages);

      const formattedMessages = dbMessages.map(msg => {
        const ts = new Date(msg.timestamp); // full Date
        return {
          id: msg.id.toString(),
          text: msg.message,
          sender: msg.senderID === Number(userID) ? 'me' : 'them',
          timestamp: ts.toISOString(),
          //timestamp: new Date(msg.timestamp).toLocaleTimeString(),
          displayTime: ts.toLocaleTimeString(), // nice clock text for bubble
        };
      });

      // const formattedMessages = dbMessages.map(msg => ({
      //   id: msg.id.toString(),
      //   text: msg.message,
      //   sender: msg.senderID === Number(userID) ? 'me' : 'them',
      //     timestamp: ts.toISOString(), // keep full date string
      //   displayTime: ts.toLocaleTimeString(), // nice clock text for bubble
       
      // }));
      // Insert date separators
      const addDateSeparators = (msgs) => {
        const result = [];
        let lastDate = null;

        msgs.forEach((msg) => {
          const msgDate = formatDate(msg.timestamp); 

          if (msgDate !== lastDate) {
            result.push({
              id: `date-${msgDate}`,
              type: 'date',
              date: msgDate,
            });
            lastDate = msgDate;
          }

          result.push({
            ...msg,
            type: 'message',
          });
        });

        return result;
      };

setMessages(addDateSeparators(formattedMessages));
      const validIds = dbMessages.map(m => Number(m.serverMessageId)).filter(id => !isNaN(id) && id > 0);
      setLastMessageId(validIds.length > 0 ? Math.max(...validIds) : 0);

      setTimeout(() => {
        flatlistRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 100);
    } catch (error) {
      console.error('Error loading messages2:', error);
    }
  };

  useEffect(() => {
  if (userID && chatPartnerID) {
    loadMessages();
    setReady(true); 
  }
}, [userID, chatPartnerID]);

  useEffect(() => {
  const show = Keyboard.addListener("keyboardDidShow", e => {
    setKeyboardHeight(e.endCoordinates.height);
  });
  const hide = Keyboard.addListener("keyboardDidHide", () => {
    setKeyboardHeight(0);
  });
  return () => {
    show.remove();
    hide.remove();
  };
}, []);

  useEffect(() => {
    loadMessages();
    
  }, [userID, chatPartnerID]);

  useEffect(() => {
  if (!userID || !chatPartnerID || !ready) return;

  const isPolling = { current: false }; 

  const pollInterval = setInterval(async () => {
    if (isPolling.current) return;
    isPolling.current = true;

    try {
      const token = await AsyncStorage.getItem(`token_${userID}`);
      if (!token) {
        console.log(token);
        console.log("No token found, skipping poll");
        return;
      }

    console.log('Polling with lastMessageId:', lastIdRef.current);

      const response = await axios.get(`${ngrok}/messages`, {
        params: { user_id: userID, chat_partner_id: chatPartnerID, last_id: lastIdRef.current },
        headers: { Authorization: `Bearer ${token}` },
      });


      const newMessages = response.data;
      if (newMessages.length > 0) {
  for (const msg of newMessages) {
    const exists = await checkMessageExists(msg.id);
    if (exists) continue;

    const dbMessage = {
      senderID: msg.sender_id,
      receiverID: msg.receiver_id,
      message: msg.message,
      timestamp: new Date(msg.timestamp).toISOString().slice(0, 19) + 'Z',
      status: 'sent',
      serverMessageId: msg.id,
    };
    await insertMessages(dbMessage);

    if (msg.sender_id === Number(chatPartnerID)) {
      await updateLatestMessage(
        Number(chatPartnerID),
        msg.message,
        dbMessage.timestamp,
        'sent'
      );
    }
  }

  const validIds = newMessages
  .map((m) => Number(m.id))
  .filter((id) => !isNaN(id) && id > 0);

if (validIds.length > 0) {
  const next = Math.max(lastIdRef.current, ...validIds);
  lastIdRef.current = next;
  setLastMessageId(next);
  setReady(true);
}

  setMessages((prev) => [
    ...prev,
    ...newMessages.map((msg) => ({
      id: msg.id.toString(),
      text: msg.message,
      sender: msg.sender_id === Number(userID) ? 'me' : 'them',
      timestamp: new Date(msg.timestamp).toLocaleTimeString(),
    })),
  ]);

  await loadMessages();

      setTimeout(() => {
        flatlistRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }
  } catch (error) {
    console.error('Error polling messages:', error);
  } finally {
    isPolling.current = false;
  }
}, 2000);

  return () => clearInterval(pollInterval);
}, [userID, chatPartnerID, ready]) 

  

  const sendMessage = async () => {
    console.log('sendMessage called');
    if (isSending || !newMessage.trim()) {
      console.log('Message empty or sending in progress, ignoring');
      return;
    }
    if (!userID || !chatPartnerID) {
      console.error('Invalid userID or chatPartnerID:', { userID, chatPartnerID });
      return;
    }

    setIsSending(true);
    const messageText = newMessage.trim();
    setNewMessage('');

    const now = new Date();
    const formattedTimestamp = now.toISOString().slice(0, 19) + 'Z';

    const dbMessage = {
      senderID: Number(userID),
      receiverID: Number(chatPartnerID),
      message: messageText,
      timestamp: formattedTimestamp,
      status: 'sent',
      serverMessageId: null,
    };

    try {
      const insertedId = await insertMessages(dbMessage);
      console.log('Message inserted to DB:', { ...dbMessage, id: insertedId });

      await updateLatestMessage(Number(chatPartnerID), messageText, formattedTimestamp, 'sent');
      await upsertChatUser(Number(userID), userData.name || 'Current User', userData.email || 'user@example.com', '', formattedTimestamp, 'sent');
      await upsertChatUser(Number(chatPartnerID), name || 'Chat Partner', 'partner@example.com', messageText, formattedTimestamp, 'sent');

      const token = await AsyncStorage.getItem('remember_token');
      await axios.post(
        `${ngrok}/messages`,
        {
          sender_id: Number(userID),
          receiver_id: Number(chatPartnerID),
          message: messageText,
          timestamp: formattedTimestamp,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadMessages();
      setTimeout(() => {
        flatlistRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    } catch (e) {
      console.error('DB or server insert error:', e);
      setNewMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    if (item.type === 'date') {
      return (
        <View style = {styles.dateContainer}>
        <View style={styles.dateBubble}> 
          <Text style = {styles.dateText}>
          {item.date}
          </Text>
        </View>
        </View>
      );
    }
    return (
    <Card
      style={[
        styles.message,
        item.sender === 'me' ? styles.myMessage : styles.theirMessage,
      ]}
    >
      <Card.Content>
        <Text
          style={[
            styles.messageText,
            item.sender === 'me' ? styles.myMessageText : styles.theirMessageText,
          ]}
        >
          {item.text}
        </Text>
        <Text
          style={[
            styles.timestamp,
            item.sender === 'me' ? styles.myTimestamp : styles.theirTimestamp,
          ]}
        >
           {item.displayTime}
         
       
        
        </Text>
        
      </Card.Content>
       
      
    </Card>
   
  );
};

  return (
    
    <KeyboardAvoidingView
       //style={{ flex: 1, backgroundColor: '#252525ff' }}
      style={styles.container}
       behavior={Platform.OS === 'android' ? 'paddingBottom' : keyboardHeight > 0 ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 44}
    >
      <LinearGradient
        colors={['#3b4d53ff', '#00000054']}
        style={styles.container}
      >
      
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Text style={styles.header}>Chat with {name}</Text>
        </TouchableWithoutFeedback>

        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatlistRef}
            data={[...messages].reverse()}
            renderItem={renderMessage}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 20,
              flexGrow: 1,
              justifyContent: 'flex-end',
            }}
            inverted={true}
            onScroll={({ nativeEvent }) => {
              const yOffset = nativeEvent.contentOffset.y;
              setShowScrollToBottom(yOffset > 100);
            }}
            keyboardShouldPersistTaps="always"
          />

          {showScrollToBottom && (
          <TouchableOpacity
            onPress={() => flatlistRef.current?.scrollToOffset({ offset: 0, animated: true })}
            style={[
              styles.showScrollToBottomButton,
              {
                bottom:
                  keyboardHeight > 0
                    ? keyboardHeight + insets.bottom + INPUT_HEIGHT + 10 // 10px spacing above input
                    : insets.bottom + INPUT_HEIGHT + 10, // always above input
              },
            ]}
          >
            <Ionicons name="arrow-down" size={24} color="#fff" />
          </TouchableOpacity>
        )}

          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View
              style={[
                styles.inputContainer,
                {
                  paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom + 10 : insets.bottom + 10,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type your message..."
                returnKeyType="send"
                onSubmitEditing={sendMessage}
              />
              <Button
                
                onPress={sendMessage}
                disabled={isSending}
                style={[styles.sendButton, isSending && styles.disabledButton]}
              >
                <Text style={styles.sendButtonText}>
                {isSending ? 'Sending...' : 'Send'}
              </Text>
                
              </Button>
              
            </View>
          </TouchableWithoutFeedback>
        </View>
      </View>
      </LinearGradient>
    </KeyboardAvoidingView>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#252525ff',
  },
  header: {
    paddingTop: 30,
    paddingBottom: 20,
    paddingLeft: 24,
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: '#2c2f309c',
    color: '#fff',
    textAlign: 'left',
  },
  message: {
    marginVertical: 6,
    paddingLeft: 10,
    paddingRight:10,
    
    borderRadius: 36,
    maxWidth: '90%',
    minWidth: 100,
    //width: 200,
  },
  myMessage: {
    backgroundColor: '#7fb6b8ff',
    alignSelf: 'flex-end',
  },
  theirMessage: {
    backgroundColor: '#ffffffff',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: '#000000ff', // White text for my messages
  },
  theirMessageText: {
    color: '#000000', // Black text for their messages
  },
  timestamp: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
  },
  myTimestamp: {
    color: '#3d3939ff', 
    
  },
  theirTimestamp: {
    color: '#333333', 
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#0e0d0d05',
    alignItems: 'center',
    
  },
  input: {
    flex: 1,
    backgroundColor: '#f7f7f7ff',
    paddingHorizontal: 10,
    borderRadius: 24,
    marginRight: 10,
    height: 40,
  },
  showScrollToBottomButton: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    backgroundColor: '#8fc9e04f',
    borderRadius: 24,
    padding: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
 sendButton: {
  backgroundColor: '#1d899cff',
  borderRadius: 24,
  paddingHorizontal: 8,
  alignItems: 'center',
  justifyContent: 'center',
  height: 40,
},

disabledButton: {
  opacity: 0.5,
},
sendButtonText: {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: 16,
},
dateContainer: {
  alignItems: 'center',
  marginVertical: 10,
},
dateBubble: {
  backgroundColor: '#2c8386ff',
  borderRadius: 20,
  paddingVertical: 4,
  paddingHorizontal: 12,
},
dateText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
},

});