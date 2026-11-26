---------------------------- MODULE DbMaster3R1W ----------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  MAX_READERS,
  WRITERS,
  READERS

VARIABLES
  writeQueue,
  activeWriter,
  completedWrites,
  activeReaders,
  completedReads,
  dbVersion

vars == <<writeQueue, activeWriter, completedWrites, activeReaders, completedReads, dbVersion>>

SeqRange(s) == { s[i] : i \in 1..Len(s) }

TypeOK ==
  /\ activeWriter \in WRITERS \cup {"NONE"}
  /\ completedWrites \subseteq WRITERS
  /\ activeReaders \subseteq READERS
  /\ completedReads \subseteq READERS
  /\ dbVersion \in Nat
  /\ Len(writeQueue) <= Cardinality(WRITERS)
  /\ SeqRange(writeQueue) \subseteq WRITERS

Init ==
  /\ writeQueue = <<>>
  /\ activeWriter = "NONE"
  /\ completedWrites = {}
  /\ activeReaders = {}
  /\ completedReads = {}
  /\ dbVersion = 0

EnqueueWrite(w) ==
  /\ w \in WRITERS
  /\ w \notin SeqRange(writeQueue)
  /\ w # activeWriter
  /\ w \notin completedWrites
  /\ writeQueue' = Append(writeQueue, w)
  /\ UNCHANGED <<activeWriter, completedWrites, activeReaders, completedReads, dbVersion>>

StartWrite ==
  /\ activeWriter = "NONE"
  /\ Len(writeQueue) > 0
  /\ activeWriter' = Head(writeQueue)
  /\ writeQueue' = Tail(writeQueue)
  /\ UNCHANGED <<completedWrites, activeReaders, completedReads, dbVersion>>

FinishWrite ==
  /\ activeWriter # "NONE"
  /\ completedWrites' = completedWrites \cup {activeWriter}
  /\ activeWriter' = "NONE"
  /\ dbVersion' = dbVersion + 1
  /\ UNCHANGED <<writeQueue, activeReaders, completedReads>>

StartRead(r) ==
  /\ r \in READERS
  /\ r \notin activeReaders
  /\ r \notin completedReads
  /\ Cardinality(activeReaders) < MAX_READERS
  /\ activeReaders' = activeReaders \cup {r}
  /\ UNCHANGED <<writeQueue, activeWriter, completedWrites, completedReads, dbVersion>>

FinishRead(r) ==
  /\ r \in activeReaders
  /\ activeReaders' = activeReaders \ {r}
  /\ completedReads' = completedReads \cup {r}
  /\ UNCHANGED <<writeQueue, activeWriter, completedWrites, dbVersion>>

Done ==
  /\ completedWrites = WRITERS
  /\ completedReads = READERS
  /\ activeWriter = "NONE"
  /\ activeReaders = {}
  /\ Len(writeQueue) = 0
  /\ UNCHANGED vars

Next ==
  \/ \E w \in WRITERS : EnqueueWrite(w)
  \/ StartWrite
  \/ FinishWrite
  \/ \E r \in READERS : StartRead(r)
  \/ \E r \in READERS : FinishRead(r)
  \/ Done

Spec ==
  Init /\ [][Next]_vars /\ WF_vars(StartWrite) /\ WF_vars(FinishWrite)

SingleActiveWriter ==
  /\ activeWriter \in WRITERS \cup {"NONE"}
  /\ activeWriter # "NONE" => activeWriter \notin SeqRange(writeQueue)
  /\ activeWriter # "NONE" => activeWriter \notin completedWrites

DisjointWriteLifecycle ==
  /\ SeqRange(writeQueue) \cap completedWrites = {}
  /\ \A i, j \in 1..Len(writeQueue) : i # j => writeQueue[i] # writeQueue[j]

ReaderPoolBound ==
  Cardinality(activeReaders) <= MAX_READERS

VersionMatchesCompletedWrites ==
  dbVersion = Cardinality(completedWrites)

AllEnqueuedWritesComplete ==
  \A w \in WRITERS : (w \in SeqRange(writeQueue)) ~> (w \in completedWrites)

=============================================================================
