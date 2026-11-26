------------------------ MODULE WhiteboardHierarchy ------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  WBS,
  CARDS

VARIABLES
  parent,
  deleted,
  cardAlive,
  childPlacements,
  shortcuts

vars == <<parent, deleted, cardAlive, childPlacements, shortcuts>>

ParentStep(S) ==
  { parent[w] : w \in S } \cap WBS

AncestorsStep(w, n) ==
  LET RECURSIVE Helper(_, _)
      Helper(cur, k) ==
        IF k = 0 THEN cur
        ELSE Helper(cur \cup ParentStep(cur), k - 1)
  IN Helper(ParentStep({w}), n)

Ancestors(w) == AncestorsStep(w, Cardinality(WBS))

Descendants(w) == { x \in WBS : w \in Ancestors(x) }

TypeOK ==
  /\ parent \in [WBS -> WBS \cup {"ROOT"}]
  /\ deleted \subseteq WBS
  /\ cardAlive \subseteq CARDS
  /\ childPlacements \in [WBS -> SUBSET WBS]
  /\ shortcuts \in [WBS -> SUBSET WBS]

Init ==
  /\ parent = [w \in WBS |-> "ROOT"]
  /\ deleted = {}
  /\ cardAlive = CARDS
  /\ childPlacements = [w \in WBS |-> {}]
  /\ shortcuts = [w \in WBS |-> {}]

MoveHierarchy(child, newParent) ==
  /\ child \in WBS
  /\ newParent \in WBS \cup {"ROOT"}
  /\ child \notin deleted
  /\ newParent # child
  /\ (newParent \in WBS => newParent \notin deleted /\ child \notin Ancestors(newParent))
  /\ LET oldParent == parent[child]
     IN
       /\ parent' = [parent EXCEPT ![child] = newParent]
       /\ childPlacements' =
            [w \in WBS |->
              LET withoutOld == IF w = oldParent THEN childPlacements[w] \ {child} ELSE childPlacements[w]
              IN IF w = newParent THEN withoutOld \cup {child} ELSE withoutOld]
       /\ UNCHANGED <<deleted, cardAlive, shortcuts>>

CopyAsShortcut(src, targetWb) ==
  /\ src \in WBS
  /\ targetWb \in WBS
  /\ src \notin deleted
  /\ targetWb \notin deleted
  /\ src # targetWb
  /\ shortcuts' = [shortcuts EXCEPT ![targetWb] = @ \cup {src}]
  /\ UNCHANGED <<parent, deleted, cardAlive, childPlacements>>

SoftDeleteWhiteboard(w) ==
  /\ w \in WBS
  /\ w \notin deleted
  /\ LET toDelete == {w} \cup Descendants(w)
     IN
       /\ deleted' = deleted \cup toDelete
       /\ childPlacements' = [x \in WBS |-> childPlacements[x] \ toDelete]
       /\ shortcuts' = [x \in WBS |-> shortcuts[x] \ toDelete]
       /\ UNCHANGED <<parent, cardAlive>>

Next ==
  \/ \E c \in WBS, p \in WBS \cup {"ROOT"} : MoveHierarchy(c, p)
  \/ \E s \in WBS, t \in WBS : CopyAsShortcut(s, t)
  \/ \E w \in WBS : SoftDeleteWhiteboard(w)
  \/ UNCHANGED vars

Spec == Init /\ [][Next]_vars

NoCycles ==
  \A w \in WBS : w \notin Ancestors(w)

SingleChildOwnership ==
  \A c \in WBS :
    Cardinality({ host \in WBS : c \in childPlacements[host] }) <= 1

PlacementMatchesParent ==
  \A c \in WBS :
    c \notin deleted =>
      \A host \in WBS : (c \in childPlacements[host]) <=> (parent[c] = host)

CardsAlwaysPreserved ==
  cardAlive = CARDS

=============================================================================
