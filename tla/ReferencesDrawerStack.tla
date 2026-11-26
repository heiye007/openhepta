----------------------- MODULE ReferencesDrawerStack -----------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  CARDS

VARIABLES
  stack,
  isOpen

vars == <<stack, isOpen>>

SeqRange(s) == { s[i] : i \in 1..Len(s) }

RemoveFromSeq(s, elem) ==
  SelectSeq(s, LAMBDA x : x # elem)

TypeOK ==
  /\ SeqRange(stack) \subseteq CARDS
  /\ Len(stack) <= Cardinality(CARDS)
  /\ isOpen \in BOOLEAN

Init ==
  /\ stack = <<>>
  /\ isOpen = FALSE

OpenCard(c) ==
  /\ c \in CARDS
  /\ stack' = <<c>> \o RemoveFromSeq(stack, c)
  /\ isOpen' = TRUE

RemoveCard(c) ==
  /\ c \in SeqRange(stack)
  /\ LET nextStack == RemoveFromSeq(stack, c)
     IN
       /\ stack' = nextStack
       /\ isOpen' = IF Len(nextStack) = 0 THEN FALSE ELSE isOpen

SwapCard(idx, newCard) ==
  /\ idx \in 1..Len(stack)
  /\ newCard \in CARDS
  /\ stack[idx] # newCard
  /\ IF newCard \in SeqRange(stack)
     THEN
       LET otherIdx == CHOOSE j \in 1..Len(stack) : stack[j] = newCard
           oldCard == stack[idx]
       IN stack' = [stack EXCEPT ![idx] = newCard, ![otherIdx] = oldCard]
     ELSE
       stack' = [stack EXCEPT ![idx] = newCard]
  /\ UNCHANGED isOpen

ReorderCard(fromIdx, toIdx) ==
  /\ fromIdx \in 1..Len(stack)
  /\ toIdx \in 1..Len(stack)
  /\ fromIdx # toIdx
  /\ LET item == stack[fromIdx]
         without == RemoveFromSeq(stack, item)
         prefix == SubSeq(without, 1, toIdx - 1)
         suffix == SubSeq(without, toIdx, Len(without))
     IN stack' = prefix \o <<item>> \o suffix
  /\ UNCHANGED isOpen

ToggleDrawer ==
  /\ isOpen' = ~isOpen
  /\ UNCHANGED stack

Next ==
  \/ \E c \in CARDS : OpenCard(c)
  \/ \E c \in CARDS : RemoveCard(c)
  \/ \E i \in 1..Len(stack), c \in CARDS : SwapCard(i, c)
  \/ \E i \in 1..Len(stack), j \in 1..Len(stack) : ReorderCard(i, j)
  \/ ToggleDrawer

Spec == Init /\ [][Next]_vars

NoDuplicateCardsInStack ==
  \A i, j \in 1..Len(stack) : i # j => stack[i] # stack[j]

StackBoundedByCards ==
  Len(stack) <= Cardinality(CARDS)

=============================================================================
