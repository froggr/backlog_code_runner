#!/usr/bin/env node

const React = require('react');
const { render, Box, Text, useInput, useApp, useStdout } = require('ink');
const { useState, useEffect } = React;

const SplitScreenDemo = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [logs, setLogs] = useState([]);
  const [output, setOutput] = useState([]);
  const [tasks] = useState([
    { id: 1, title: 'Create hello.txt', status: 'For Agent' },
    { id: 2, title: 'Update README', status: 'For Agent' },
    { id: 3, title: 'Fix bug in parser', status: 'For Agent' }
  ]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = { timestamp, message, type, id: Date.now() };
    setLogs(prev => [...prev.slice(-9), newLog]);
  };

  const addOutput = (line) => {
    setOutput(prev => [...prev.slice(-14), line]);
  };

  useInput((input, key) => {
    if (key.ctrl && key.name === 'c') {
      exit();
      return;
    }

    switch (input.toLowerCase()) {
      case 'q':
        exit();
        break;
      case 's':
        addLog('🚀 Starting task...', 'info');
        addOutput('OpenCode: Starting task execution...');
        setTimeout(() => {
          addOutput('OpenCode: Reading task details...');
          addOutput('OpenCode: Creating hello.txt file...');
          addOutput('OpenCode: File created successfully');
          addLog('✅ Task completed', 'success');
        }, 1000);
        break;
      case 'r':
        addLog('🔄 Refreshing...', 'info');
        break;
      case 'c':
        setOutput([]);
        break;
      case 'l':
        setLogs([]);
        break;
    }
  });

  useEffect(() => {
    addLog('🚀 Backlog Runner started', 'success');
    addOutput('System ready for OpenCode execution...');
  }, []);

  const getLogColor = (type) => {
    switch (type) {
      case 'error': return 'red';
      case 'warning': return 'yellow';
      case 'success': return 'green';
      default: return 'cyan';
    }
  };

  return React.createElement(Box, {
    flexDirection: 'row',
    height: stdout.rows || 24,
    width: stdout.columns || 80
  }, [
    // Left Panel - Status & Controls
    React.createElement(Box, {
      key: 'left',
      flexDirection: 'column',
      width: '50%',
      paddingX: 2,
      paddingY: 1
    }, [
      // Header
      React.createElement(Box, {
        key: 'header',
        borderStyle: 'double',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1
      }, [
        React.createElement(Text, {
          key: 'title',
          color: 'cyan',
          bold: true
        }, '🔄 BACKLOG RUNNER')
      ]),

      // Status
      React.createElement(Box, {
        key: 'status',
        marginTop: 1
      }, [
        React.createElement(Text, {
          key: 'status-text',
          color: 'green'
        }, 'Status: ⚡ READY')
      ]),

      // Task Queue
      React.createElement(Box, {
        key: 'queue',
        marginTop: 1,
        flexDirection: 'column'
      }, [
        React.createElement(Text, {
          key: 'queue-title',
          color: 'magenta',
          bold: true
        }, `📋 Task Queue (${tasks.length}):`),
        ...tasks.map((task, index) =>
          React.createElement(Box, {
            key: `task-${task.id}`,
            marginLeft: 2
          }, [
            React.createElement(Text, {
              key: `task-text-${task.id}`,
              color: index === 0 ? 'green' : 'white'
            }, `${index === 0 ? '▶ ' : `${index + 1}. `}${task.title}`)
          ])
        )
      ]),

      // Controls
      React.createElement(Box, {
        key: 'controls',
        marginTop: 2,
        flexDirection: 'column'
      }, [
        React.createElement(Text, {
          key: 'controls-title',
          color: 'yellow',
          bold: true
        }, '🎮 Controls:'),
        React.createElement(Text, {
          key: 'controls-text'
        }, '  [S]tart • [R]efresh • [C]lear • [L]ogs • [Q]uit')
      ])
    ]),

    // Right Panel - Logs & Output
    React.createElement(Box, {
      key: 'right',
      flexDirection: 'column',
      width: '50%',
      paddingX: 2,
      paddingY: 1
    }, [
      // OpenCode Output
      React.createElement(Box, {
        key: 'output',
        flexDirection: 'column',
        height: '60%',
        borderStyle: 'single',
        borderColor: 'green',
        paddingX: 1
      }, [
        React.createElement(Text, {
          key: 'output-title',
          color: 'green',
          bold: true
        }, '🤖 OpenCode Output:'),
        React.createElement(Box, {
          key: 'output-content',
          flexDirection: 'column',
          height: '100%'
        }, output.length === 0 ? [
          React.createElement(Text, {
            key: 'output-empty',
            color: 'gray'
          }, 'No OpenCode output yet...')
        ] : output.map((line, index) =>
          React.createElement(Text, {
            key: `output-${index}`,
            color: 'white'
          }, line)
        ))
      ]),

      // Activity Logs
      React.createElement(Box, {
        key: 'logs',
        flexDirection: 'column',
        height: '40%',
        borderStyle: 'single',
        borderColor: 'blue',
        paddingX: 1,
        marginTop: 1
      }, [
        React.createElement(Text, {
          key: 'logs-title',
          color: 'blue',
          bold: true
        }, '📜 Activity Logs:'),
        React.createElement(Box, {
          key: 'logs-content',
          flexDirection: 'column',
          height: '100%'
        }, logs.length === 0 ? [
          React.createElement(Text, {
            key: 'logs-empty',
            color: 'gray'
          }, 'No activity yet...')
        ] : logs.map((log, index) =>
          React.createElement(Text, {
            key: `log-${log.id}`,
            color: getLogColor(log.type)
          }, `[${log.timestamp}] ${log.message}`)
        ))
      ])
    ])
  ]);
};

// Render the app
const { waitUntilExit } = render(React.createElement(SplitScreenDemo));

// Keep the process alive
waitUntilExit().catch(console.error);
